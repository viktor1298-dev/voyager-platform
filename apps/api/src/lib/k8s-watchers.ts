import * as k8s from '@kubernetes/client-node'
import { SSE_DEPLOYMENT_PROGRESS_INTERVAL_MS, SSE_LOG_TAIL_LINES } from '@voyager/config/sse'
import type { DeploymentProgressEvent, LogLineEvent } from '@voyager/types'
import { clusterClientPool } from './cluster-client-pool.js'
import { clusterWatchManager } from './cluster-watch-manager.js'
import { voyagerEmitter } from './event-emitter.js'

// ── Deployment Progress (on-demand, per-cluster) ────────────

export function watchDeploymentProgress(
  name: string,
  namespace: string,
  signal: AbortSignal | undefined,
  clusterId?: string,
): void {
  const poll = async () => {
    if (signal?.aborted) return
    try {
      let appsApi: k8s.AppsV1Api
      if (clusterId) {
        const kc = await clusterClientPool.getClient(clusterId)
        appsApi = kc.makeApiClient(k8s.AppsV1Api)
      } else {
        // Fallback for backward compat — use default kubeconfig
        const kc = new k8s.KubeConfig()
        kc.loadFromDefault()
        appsApi = kc.makeApiClient(k8s.AppsV1Api)
      }

      const dep = await appsApi.readNamespacedDeployment({ name, namespace })
      const replicas = dep.spec?.replicas ?? 0
      const ready = dep.status?.readyReplicas ?? 0
      const updated = dep.status?.updatedReplicas ?? 0
      const available = dep.status?.availableReplicas ?? 0
      const progressPercent = replicas > 0 ? Math.round((ready / replicas) * 100) : 0

      let status: DeploymentProgressEvent['status'] = 'progressing'
      if (ready === replicas && replicas > 0) status = 'available'
      else if (ready === 0 && replicas > 0) status = 'degraded'

      const progressing = dep.status?.conditions?.find((c) => c.type === 'Progressing')
      if (progressing?.reason === 'ProgressDeadlineExceeded') status = 'stalled'

      const event: DeploymentProgressEvent = {
        clusterId,
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

// ── Log Streaming — Follow Mode (IP3-005) ───────────────────

export async function streamLogsFollow(
  clusterId: string,
  namespace: string,
  podName: string,
  container: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const kc = await clusterClientPool.getClient(clusterId)
  const log = new k8s.Log(kc)
  const podKey = `${clusterId}/${namespace}/${podName}${container ? `/${container}` : ''}`

  // k8s.Log.log() takes a Writable stream as parameter
  const { Writable } = await import('node:stream')
  const outputStream = new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        const spaceIdx = line.indexOf(' ')
        const timestamp = spaceIdx > 0 ? line.substring(0, spaceIdx) : new Date().toISOString()
        const logLine = spaceIdx > 0 ? line.substring(spaceIdx + 1) : line

        const event: LogLineEvent = {
          line: logLine,
          timestamp,
          isNewSinceConnect: true,
        }
        voyagerEmitter.emitLogLine(podKey, event)
      }
      callback()
    },
  })

  const abortController = await log.log(namespace, podName, container ?? '', outputStream, {
    follow: true,
    tailLines: SSE_LOG_TAIL_LINES,
    timestamps: true,
  })

  signal.addEventListener('abort', () => {
    abortController.abort()
    outputStream.destroy()
  })
}

/**
 * @deprecated Use streamLogsFollow() with clusterId instead.
 * Kept for backward compatibility.
 */
export function streamLogs(
  podName: string,
  namespace: string,
  container: string | undefined,
  signal: AbortSignal | undefined,
): void {
  const kc = new k8s.KubeConfig()
  kc.loadFromDefault()
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

  const interval = setInterval(poll, 2000)
  if (signal) {
    signal.addEventListener('abort', () => clearInterval(interval))
  }
  poll()
}

// ── Cleanup ─────────────────────────────────────────────────

export function stopAllWatchers(): void {
  clusterWatchManager.stopAll()
}
