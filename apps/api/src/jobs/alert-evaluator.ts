import * as k8s from '@kubernetes/client-node'
import { alertHistory, alerts, clusters, db } from '@voyager/db'
import { and, eq, gte } from 'drizzle-orm'
import { JOB_INTERVALS } from '../config/jobs.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'

type MetricType = 'cpu' | 'memory' | 'pods' | 'restarts'
type Operator = 'gt' | 'lt' | 'eq'

async function gatherMetric(clusterId: string, metric: MetricType): Promise<number> {
  const kc = await clusterClientPool.getClient(clusterId)
  const coreV1Api = kc.makeApiClient(k8s.CoreV1Api)

  switch (metric) {
    case 'pods': {
      const podsRes = await coreV1Api.listPodForAllNamespaces()
      return podsRes.items.length
    }
    case 'restarts': {
      const podsRes = await coreV1Api.listPodForAllNamespaces()
      return podsRes.items.reduce((sum, pod) => {
        const containerRestarts = (pod.status?.containerStatuses ?? []).reduce(
          (s, cs) => s + (cs.restartCount ?? 0),
          0,
        )
        return sum + containerRestarts
      }, 0)
    }
    case 'cpu':
    case 'memory': {
      const nodesRes = await coreV1Api.listNode()
      if (nodesRes.items.length === 0) return 0

      const podsRes = await coreV1Api.listPodForAllNamespaces()
      let totalRequest = 0
      let totalCapacity = 0

      for (const node of nodesRes.items) {
        const cap = node.status?.capacity?.[metric === 'cpu' ? 'cpu' : 'memory']
        if (cap) totalCapacity += parseK8sResource(cap, metric)
      }

      for (const pod of podsRes.items) {
        if (pod.status?.phase !== 'Running') continue
        for (const container of pod.spec?.containers ?? []) {
          const req = container.resources?.requests?.[metric === 'cpu' ? 'cpu' : 'memory']
          if (req) totalRequest += parseK8sResource(req, metric)
        }
      }

      return totalCapacity > 0 ? Math.round((totalRequest / totalCapacity) * 100) : 0
    }
  }
}

function parseK8sResource(value: string, metric: 'cpu' | 'memory'): number {
  if (metric === 'cpu') {
    if (value.endsWith('m')) return Number.parseInt(value, 10)
    if (value.endsWith('n')) return Number.parseInt(value, 10) / 1_000_000
    return Number.parseFloat(value) * 1000
  }
  if (value.endsWith('Ki')) return Number.parseInt(value, 10) * 1024
  if (value.endsWith('Mi')) return Number.parseInt(value, 10) * 1024 * 1024
  if (value.endsWith('Gi')) return Number.parseInt(value, 10) * 1024 * 1024 * 1024
  return Number.parseInt(value, 10)
}

function compareValue(value: number, operator: Operator, threshold: number): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold
    case 'lt':
      return value < threshold
    case 'eq':
      return value === threshold
  }
}

async function isDuplicate(alertId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - JOB_INTERVALS.ALERT_DEDUP_WINDOW_MS)
  const recent = await db
    .select({ id: alertHistory.id })
    .from(alertHistory)
    .where(and(eq(alertHistory.alertId, alertId), gte(alertHistory.triggeredAt, cutoff)))
    .limit(1)
  return recent.length > 0
}

async function evaluateAlerts(): Promise<void> {
  const allAlerts = await db.select().from(alerts).where(eq(alerts.enabled, true))

  for (const alert of allAlerts) {
    try {
      if (await isDuplicate(alert.id)) continue

      const clusterIds: string[] = []
      if (alert.clusterFilter) {
        clusterIds.push(alert.clusterFilter)
      } else {
        const allClusters = await db
          .select({ id: clusters.id })
          .from(clusters)
          .where(eq(clusters.isActive, true))
        clusterIds.push(...allClusters.map((c) => c.id))
      }

      const results = await Promise.allSettled(
        clusterIds.map((clusterId) => gatherMetric(clusterId, alert.metric as MetricType)),
      )

      let totalValue = 0
      let clusterCount = 0
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'fulfilled') {
          totalValue += result.value
          clusterCount++
        } else {
          console.warn(
            `[alert-evaluator] failed to gather ${alert.metric} from cluster ${clusterIds[i]}`,
            result.reason,
          )
        }
      }

      if (clusterCount === 0) continue

      const metricValue =
        alert.metric === 'cpu' || alert.metric === 'memory'
          ? Math.round(totalValue / clusterCount)
          : totalValue

      const threshold = Number(alert.threshold)
      if (compareValue(metricValue, alert.operator as Operator, threshold)) {
        const message = `Alert "${alert.name}": ${alert.metric} is ${metricValue} (${alert.operator} ${threshold})`
        await db.insert(alertHistory).values({
          alertId: alert.id,
          value: String(metricValue),
          message,
        })
        console.log(`[alert-evaluator] fired: ${message}`)
      }
    } catch (err) {
      console.error(`[alert-evaluator] error evaluating alert ${alert.id}`, err)
    }
  }
}

let intervalHandle: NodeJS.Timeout | null = null
let isRunning = false

export function startAlertEvaluator(): void {
  if (intervalHandle) return

  const run = async () => {
    if (isRunning) return
    isRunning = true
    try {
      await evaluateAlerts()
    } catch (error) {
      console.error('[alert-evaluator] job run failed', error)
    } finally {
      isRunning = false
    }
  }

  void run()
  intervalHandle = setInterval(() => {
    void run()
  }, JOB_INTERVALS.ALERT_EVAL_MS)
}

export function stopAlertEvaluator(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
