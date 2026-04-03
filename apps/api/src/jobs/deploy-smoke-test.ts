import * as k8s from '@kubernetes/client-node'
import { alertHistory, alerts, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { JOB_INTERVALS } from '../config/jobs.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { type CheckStatus, scanLogsForErrors } from '../lib/health-checks.js'
import { createComponentLogger } from '../lib/logger.js'

const log = createComponentLogger('deploy-smoke-test')

interface DeploymentEvent {
  type: 'added' | 'modified' | 'deleted'
  clusterId: string
  data: k8s.V1Deployment
}

interface SmokeResult {
  status: CheckStatus
  checks: Array<{ name: string; status: CheckStatus; message: string }>
}

/** Track seen generations to avoid re-checking the same rollout */
const seenGenerations = new Map<string, number>()

/** Pending smoke test timers so we can cancel on shutdown */
const pendingTimers = new Set<NodeJS.Timeout>()

function deploymentKey(clusterId: string, namespace: string, name: string): string {
  return `${clusterId}/${namespace}/${name}`
}

async function runSmokeChecks(
  clusterId: string,
  namespace: string,
  depName: string,
): Promise<SmokeResult> {
  const checks: SmokeResult['checks'] = []
  let worstStatus: CheckStatus = 'pass'

  const kc = await clusterClientPool.getClient(clusterId)
  const coreApi = kc.makeApiClient(k8s.CoreV1Api)

  // 1. Pod status — list pods by app label, check for bad states
  const podList = await coreApi.listNamespacedPod({
    namespace,
    labelSelector: `app=${depName}`,
  })
  const pods = podList.items

  if (pods.length === 0) {
    checks.push({ name: 'pod-status', status: 'fail', message: 'No pods found for deployment' })
    return { status: 'fail', checks }
  }

  const badStates = ['CrashLoopBackOff', 'OOMKilled', 'ImagePullBackOff', 'Error']
  const podsWithBadState: string[] = []

  for (const pod of pods) {
    const statuses = [
      ...(pod.status?.containerStatuses ?? []),
      ...(pod.status?.initContainerStatuses ?? []),
    ]
    for (const cs of statuses) {
      const waitingReason = cs.state?.waiting?.reason ?? ''
      const terminatedReason = cs.state?.terminated?.reason ?? ''
      for (const bad of badStates) {
        if (waitingReason === bad || terminatedReason === bad) {
          podsWithBadState.push(`${pod.metadata?.name}: ${bad}`)
        }
      }
    }
  }

  if (podsWithBadState.length > 0) {
    checks.push({
      name: 'pod-status',
      status: 'fail',
      message: `Bad pod states: ${podsWithBadState.join(', ')}`,
    })
    worstStatus = 'fail'
  } else {
    checks.push({ name: 'pod-status', status: 'pass', message: `All ${pods.length} pods healthy` })
  }

  // 2. Restart count — max restarts >3 = fail, any restart = warn
  let maxRestarts = 0
  for (const pod of pods) {
    for (const cs of pod.status?.containerStatuses ?? []) {
      maxRestarts = Math.max(maxRestarts, cs.restartCount ?? 0)
    }
  }

  if (maxRestarts > 3) {
    checks.push({
      name: 'restart-count',
      status: 'fail',
      message: `Max restart count: ${maxRestarts} (threshold: 3)`,
    })
    worstStatus = 'fail'
  } else if (maxRestarts > 0) {
    checks.push({
      name: 'restart-count',
      status: 'warn',
      message: `Container restarts detected: max ${maxRestarts}`,
    })
    if (worstStatus === 'pass') worstStatus = 'warn'
  } else {
    checks.push({ name: 'restart-count', status: 'pass', message: 'No container restarts' })
  }

  // 3. Log scan — read first pod's last 100 log lines
  const firstPodName = pods[0]?.metadata?.name
  if (firstPodName) {
    try {
      const logResponse = await coreApi.readNamespacedPodLog({
        name: firstPodName,
        namespace,
        tailLines: 100,
      })
      const logText = typeof logResponse === 'string' ? logResponse : String(logResponse)
      const lines = logText.split('\n').filter(Boolean)
      const scanResult = scanLogsForErrors(lines)

      if (scanResult.status === 'fail') {
        checks.push({
          name: 'log-scan',
          status: 'fail',
          message: `Log errors: ${scanResult.errorCount}, critical: ${scanResult.criticalMatches.join(', ')}`,
        })
        worstStatus = 'fail'
      } else if (scanResult.status === 'warn') {
        checks.push({
          name: 'log-scan',
          status: 'warn',
          message: `Log errors: ${scanResult.errorCount}`,
        })
        if (worstStatus === 'pass') worstStatus = 'warn'
      } else {
        checks.push({ name: 'log-scan', status: 'pass', message: 'No concerning log patterns' })
      }
    } catch (err) {
      checks.push({
        name: 'log-scan',
        status: 'warn',
        message: `Could not read logs: ${err instanceof Error ? err.message : 'unknown error'}`,
      })
      if (worstStatus === 'pass') worstStatus = 'warn'
    }
  }

  // 4. Readiness — check all pods have Ready=True condition
  const unreadyPods: string[] = []
  for (const pod of pods) {
    const readyCondition = pod.status?.conditions?.find((c) => c.type === 'Ready')
    if (!readyCondition || readyCondition.status !== 'True') {
      unreadyPods.push(pod.metadata?.name ?? 'unknown')
    }
  }

  if (unreadyPods.length > 0) {
    checks.push({
      name: 'readiness',
      status: 'fail',
      message: `Unready pods: ${unreadyPods.join(', ')}`,
    })
    worstStatus = 'fail'
  } else {
    checks.push({
      name: 'readiness',
      status: 'pass',
      message: `All ${pods.length} pods ready`,
    })
  }

  return { status: worstStatus, checks }
}

async function findOrCreateAlertRule(depName: string, clusterId: string): Promise<string> {
  const ruleName = `Deploy smoke test: ${depName}`
  const existing = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(eq(alerts.name, ruleName))
    .limit(1)

  if (existing.length > 0) {
    return existing[0].id
  }

  const [created] = await db
    .insert(alerts)
    .values({
      name: ruleName,
      metric: 'deploy-smoke',
      operator: 'gt',
      threshold: '0',
      clusterFilter: clusterId,
      enabled: true,
    })
    .returning({ id: alerts.id })

  return created.id
}

async function handleDeploymentEvent(event: DeploymentEvent): Promise<void> {
  if (event.type !== 'modified') return

  const deployment = event.data
  const generation = deployment.metadata?.generation ?? 0
  const observedGeneration = deployment.status?.observedGeneration ?? 0
  const namespace = deployment.metadata?.namespace ?? 'default'
  const depName = deployment.metadata?.name ?? 'unknown'
  const key = deploymentKey(event.clusterId, namespace, depName)

  // Only trigger on new rollouts (generation > observedGeneration)
  if (generation <= observedGeneration) return

  // Skip if we already processed this generation
  const lastSeen = seenGenerations.get(key)
  if (lastSeen !== undefined && lastSeen >= generation) return
  seenGenerations.set(key, generation)
  setTimeout(() => seenGenerations.delete(key), 5 * 60_000).unref()

  log.info(
    { clusterId: event.clusterId, deployment: depName, namespace, generation },
    'new rollout detected',
  )

  // Wait for pods to stabilize before checking
  const timer = setTimeout(async () => {
    pendingTimers.delete(timer)
    try {
      const result = await runSmokeChecks(event.clusterId, namespace, depName)

      if (result.status === 'pass') {
        log.info({ clusterId: event.clusterId, deployment: depName, namespace }, 'PASS: all checks green')
        return
      }

      const alertId = await findOrCreateAlertRule(depName, event.clusterId)
      const failedChecks = result.checks.filter((c) => c.status !== 'pass')
      const message = `Deploy smoke ${result.status}: ${depName} in ${namespace} — ${failedChecks.map((c) => `${c.name}: ${c.message}`).join('; ')}`

      await db.insert(alertHistory).values({
        alertId,
        value: result.status === 'fail' ? '2' : '1',
        message,
      })

      voyagerEmitter.emitAlert({
        id: alertId,
        name: `Deploy smoke test: ${depName}`,
        metric: 'deploy-smoke',
        operator: 'gt',
        threshold: 0,
        currentValue: result.status === 'fail' ? 2 : 1,
        severity: result.status === 'fail' ? 'critical' : 'warning',
        clusterId: event.clusterId,
        triggeredAt: new Date().toISOString(),
      })

      log.warn(
        { clusterId: event.clusterId, deployment: depName, namespace, status: result.status, failedChecks: failedChecks.length },
        message,
      )
    } catch (err) {
      log.error({ clusterId: event.clusterId, deployment: depName, namespace, err }, 'error running smoke checks')
    }
  }, JOB_INTERVALS.DEPLOY_SMOKE_DELAY_MS)

  pendingTimers.add(timer)
}

let listening = false

export function startDeploySmokeTest(): void {
  if (listening) return
  listening = true
  voyagerEmitter.on('deployment-event', (event: DeploymentEvent) => {
    void handleDeploymentEvent(event)
  })
  log.info('listening for deployment events')
}

export function stopDeploySmokeTest(): void {
  if (!listening) return
  listening = false
  voyagerEmitter.removeAllListeners('deployment-event')
  for (const timer of pendingTimers) {
    clearTimeout(timer)
  }
  pendingTimers.clear()
  seenGenerations.clear()
}
