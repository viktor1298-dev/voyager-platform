import * as k8s from '@kubernetes/client-node'
import {
  SSE_ALERT_CHECK_INTERVAL_MS,
  SSE_DEPLOYMENT_PROGRESS_INTERVAL_MS,
  SSE_INITIAL_RECONNECT_DELAY_MS,
  SSE_LOG_POLL_INTERVAL_MS,
  SSE_LOG_TAIL_LINES,
  SSE_MAX_RECONNECT_DELAY_MS,
  SSE_METRICS_INTERVAL_MS,
  SSE_POD_WATCH_RECONNECT_DELAY_MS,
  SSE_RECONNECT_BACKOFF_MULTIPLIER,
} from '@voyager/config/sse'
import type {
  AlertEvent,
  ContainerStatusSummary,
  DeploymentProgressEvent,
  LogLineEvent,
  MetricsEvent,
  PodEvent,
  PodEventType,
  PodPhase,
} from '@voyager/types'
import { voyagerEmitter } from './event-emitter'
import { getKubeConfig } from './k8s'

// ── Backoff Helper ──────────────────────────────────────────

function getBackoffDelay(attempt: number): number {
  const delay = SSE_INITIAL_RECONNECT_DELAY_MS * SSE_RECONNECT_BACKOFF_MULTIPLIER ** attempt
  return Math.min(delay, SSE_MAX_RECONNECT_DELAY_MS)
}

// ── Pod Watcher ─────────────────────────────────────────────

let podWatchAbort: (() => void) | null = null

function mapContainerStatuses(
  statuses: k8s.V1ContainerStatus[] | undefined,
): ContainerStatusSummary[] {
  return (statuses ?? []).map((cs) => {
    let state: 'running' | 'waiting' | 'terminated' = 'waiting'
    let reason: string | undefined
    if (cs.state?.running) state = 'running'
    else if (cs.state?.terminated) {
      state = 'terminated'
      reason = cs.state.terminated.reason ?? undefined
    } else if (cs.state?.waiting) {
      reason = cs.state.waiting.reason ?? undefined
    }
    return {
      name: cs.name,
      ready: cs.ready ?? false,
      restartCount: cs.restartCount ?? 0,
      state,
      reason,
    }
  })
}

export async function startPodWatcher(): Promise<void> {
  const kc = getKubeConfig()
  const watch = new k8s.Watch(kc)

  let attempt = 0

  const doWatch = () => {
    watch
      .watch(
        '/api/v1/pods',
        {},
        (type: string, pod: k8s.V1Pod) => {
          attempt = 0 // Reset backoff on successful event
          const event: PodEvent = {
            type: type.toLowerCase() as PodEventType,
            name: pod.metadata?.name ?? 'unknown',
            namespace: pod.metadata?.namespace ?? 'default',
            phase: (pod.status?.phase as PodPhase) ?? 'Unknown',
            reason: pod.status?.reason,
            message: pod.status?.message,
            restartCount: (pod.status?.containerStatuses ?? []).reduce(
              (sum, cs) => sum + (cs.restartCount ?? 0),
              0,
            ),
            containerStatuses: mapContainerStatuses(pod.status?.containerStatuses),
            timestamp: new Date().toISOString(),
          }
          voyagerEmitter.emitPodEvent(event)
        },
        (err) => {
          if (err) {
            const delay = getBackoffDelay(attempt)
            console.error(`Pod watch error, reconnecting in ${delay}ms...`, err.message)
            attempt++
            setTimeout(doWatch, delay)
          }
        },
      )
      .then((req) => {
        podWatchAbort = () => req.abort()
      })
      .catch((err) => {
        const delay = getBackoffDelay(attempt)
        console.error(`Failed to start pod watch, retrying in ${delay}ms:`, err.message)
        attempt++
        setTimeout(doWatch, delay)
      })
  }
  doWatch()
}

// ── Metrics Poller ──────────────────────────────────────────

let metricsInterval: ReturnType<typeof setInterval> | null = null

export function startMetricsPoller(): void {
  const poll = async () => {
    try {
      const kc = getKubeConfig()
      const metricsClient = new k8s.Metrics(kc)
      const nodeMetrics = await metricsClient.getNodeMetrics()

      let totalCpuNano = 0
      let totalMemBytes = 0
      for (const node of nodeMetrics.items) {
        const cpuStr = node.usage?.cpu ?? '0'
        const memStr = node.usage?.memory ?? '0'
        totalCpuNano += parseCpuToNano(cpuStr)
        totalMemBytes += parseMemoryToBytes(memStr)
      }

      const event: MetricsEvent = {
        cpuCores: totalCpuNano / 1e9,
        cpuPercent: null, // Requires node capacity info for real percentage
        memoryBytes: totalMemBytes,
        memoryPercent: null,
        podCount: 0, // Filled below
        timestamp: new Date().toISOString(),
      }

      // Get pod count
      try {
        const coreApi = kc.makeApiClient(k8s.CoreV1Api)
        const pods = await coreApi.listPodForAllNamespaces()
        event.podCount = pods.items?.length ?? 0
      } catch {
        // ignore
      }

      voyagerEmitter.emitMetrics(event)
    } catch (err) {
      // Metrics API may not be available (e.g., no metrics-server)
      // Silently skip — clients will just not receive updates
    }
  }

  metricsInterval = setInterval(poll, SSE_METRICS_INTERVAL_MS)
  poll()
}

// ── Helpers ─────────────────────────────────────────────────

function parseCpuToNano(cpu: string): number {
  if (cpu.endsWith('n')) return Number.parseInt(cpu, 10)
  if (cpu.endsWith('u')) return Number.parseInt(cpu, 10) * 1000
  if (cpu.endsWith('m')) return Number.parseInt(cpu, 10) * 1e6
  return Number.parseFloat(cpu) * 1e9
}

function parseMemoryToBytes(mem: string): number {
  if (mem.endsWith('Ki')) return Number.parseInt(mem, 10) * 1024
  if (mem.endsWith('Mi')) return Number.parseInt(mem, 10) * 1024 * 1024
  if (mem.endsWith('Gi')) return Number.parseInt(mem, 10) * 1024 * 1024 * 1024
  return Number.parseInt(mem, 10)
}

// ── Deployment Progress (on-demand) ─────────────────────────

export function watchDeploymentProgress(
  name: string,
  namespace: string,
  signal: AbortSignal | undefined,
): void {
  const kc = getKubeConfig()
  const appsApi = kc.makeApiClient(k8s.AppsV1Api)

  const poll = async () => {
    if (signal?.aborted) return
    try {
      const dep = await appsApi.readNamespacedDeployment({ name, namespace })
      const replicas = dep.spec?.replicas ?? 0
      const ready = dep.status?.readyReplicas ?? 0
      const updated = dep.status?.updatedReplicas ?? 0
      const available = dep.status?.availableReplicas ?? 0
      const progressPercent = replicas > 0 ? Math.round((ready / replicas) * 100) : 0

      let status: DeploymentProgressEvent['status'] = 'progressing'
      if (ready === replicas && replicas > 0) status = 'available'
      else if (ready === 0 && replicas > 0) status = 'degraded'

      // Check for stall condition
      const progressing = dep.status?.conditions?.find((c) => c.type === 'Progressing')
      if (progressing?.reason === 'ProgressDeadlineExceeded') status = 'stalled'

      const event: DeploymentProgressEvent = {
        name,
        namespace,
        replicas,
        readyReplicas: ready,
        updatedReplicas: updated,
        availableReplicas: available,
        progressPercent,
        status,
        conditions: (dep.status?.conditions ?? []).map((c) => ({
          type: c.type ?? '',
          status: c.status ?? '',
          reason: c.reason ?? undefined,
          message: c.message ?? undefined,
        })),
        timestamp: new Date().toISOString(),
      }
      voyagerEmitter.emitDeploymentProgress(event)
    } catch {
      // Deployment may have been deleted
    }
  }

  const interval = setInterval(poll, SSE_DEPLOYMENT_PROGRESS_INTERVAL_MS)
  if (signal) {
    signal.addEventListener('abort', () => clearInterval(interval))
  }
  poll()
}

// ── Log Streaming (on-demand) ───────────────────────────────

export function streamLogs(
  podName: string,
  namespace: string,
  container: string | undefined,
  signal: AbortSignal | undefined,
): void {
  const kc = getKubeConfig()
  const coreApi = kc.makeApiClient(k8s.CoreV1Api)
  const podKey = `${namespace}/${podName}${container ? `/${container}` : ''}`

  let lastTimestamp: string | undefined

  const poll = async () => {
    if (signal?.aborted) return
    try {
      const response = await coreApi.readNamespacedPodLog({
        name: podName,
        namespace,
        container,
        tailLines: lastTimestamp ? undefined : SSE_LOG_TAIL_LINES,
        timestamps: true,
      })

      const text = typeof response === 'string' ? response : String(response)
      const lines = text.split('\n').filter(Boolean)

      for (const line of lines) {
        // K8s log lines with timestamps: "2024-01-01T00:00:00.000Z log message"
        const spaceIdx = line.indexOf(' ')
        const timestamp = spaceIdx > 0 ? line.substring(0, spaceIdx) : new Date().toISOString()
        const logLine = spaceIdx > 0 ? line.substring(spaceIdx + 1) : line

        const event: LogLineEvent = {
          line: logLine,
          timestamp,
          isNewSinceConnect: !!lastTimestamp,
        }
        voyagerEmitter.emitLogLine(podKey, event)
        lastTimestamp = timestamp
      }
    } catch {
      // Pod may have been deleted
    }
  }

  const interval = setInterval(poll, SSE_LOG_POLL_INTERVAL_MS)
  if (signal) {
    signal.addEventListener('abort', () => clearInterval(interval))
  }
  poll()
}

// ── Cleanup ─────────────────────────────────────────────────

export function stopAllWatchers(): void {
  if (podWatchAbort) podWatchAbort()
  if (metricsInterval) clearInterval(metricsInterval)
}
