import * as k8s from '@kubernetes/client-node'
import type { MetricsStreamEvent } from '@voyager/types'
import { JOB_INTERVALS } from '../config/jobs.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'

interface Poller {
  interval: NodeJS.Timeout
  subscribers: Set<string>
}

/**
 * Reference-counted K8s metrics-server polling job.
 * Starts polling a cluster when the first SSE subscriber connects,
 * stops when the last subscriber disconnects.
 */
class MetricsStreamJob {
  private pollers = new Map<string, Poller>()

  subscribe(clusterId: string, connectionId: string): void {
    let poller = this.pollers.get(clusterId)
    if (!poller) {
      const interval = setInterval(
        () => void this.poll(clusterId),
        JOB_INTERVALS.METRICS_STREAM_POLL_MS,
      )
      poller = { interval, subscribers: new Set() }
      this.pollers.set(clusterId, poller)
      // Immediate first poll -- don't make the client wait for the first interval
      void this.poll(clusterId)
    }
    poller.subscribers.add(connectionId)
  }

  unsubscribe(clusterId: string, connectionId: string): void {
    const poller = this.pollers.get(clusterId)
    if (!poller) return
    poller.subscribers.delete(connectionId)
    if (poller.subscribers.size === 0) {
      clearInterval(poller.interval)
      this.pollers.delete(clusterId)
    }
  }

  /** Stop all pollers (used during graceful shutdown) */
  stopAll(): void {
    for (const [, poller] of this.pollers) {
      clearInterval(poller.interval)
    }
    this.pollers.clear()
  }

  getStatus(): { activePollers: number; clusterIds: string[] } {
    return {
      activePollers: this.pollers.size,
      clusterIds: Array.from(this.pollers.keys()),
    }
  }

  private async poll(clusterId: string): Promise<void> {
    // Guard: don't emit if no subscribers (race condition protection)
    if (!this.pollers.has(clusterId)) return

    try {
      const kc = await clusterClientPool.getClient(clusterId)
      const metricsClient = new k8s.Metrics(kc)
      const coreApi = kc.makeApiClient(k8s.CoreV1Api)

      const [nodesRes, nodeMetrics, podsRes] = await Promise.all([
        coreApi.listNode(),
        metricsClient.getNodeMetrics(),
        coreApi.listPodForAllNamespaces(),
      ])

      // Build allocatable map
      let totalCpuAllocatable = 0
      let totalMemAllocatable = 0
      for (const node of nodesRes.items) {
        totalCpuAllocatable += parseCpuToNano(node.status?.allocatable?.cpu ?? '0')
        totalMemAllocatable += parseMemToBytes(node.status?.allocatable?.memory ?? '0')
      }

      // Sum usage from node metrics
      let totalCpuUsageNano = 0
      let totalMemUsageBytes = 0
      for (const nm of nodeMetrics.items) {
        totalCpuUsageNano += parseCpuToNano(nm.usage?.cpu ?? '0')
        totalMemUsageBytes += parseMemToBytes(nm.usage?.memory ?? '0')
      }

      const cpuPercent =
        totalCpuAllocatable > 0
          ? Math.round((totalCpuUsageNano / totalCpuAllocatable) * 1000) / 10
          : null
      const memPercent =
        totalMemAllocatable > 0
          ? Math.round((totalMemUsageBytes / totalMemAllocatable) * 1000) / 10
          : null

      // Network bytes: attempt via pod metrics (best-effort, usually null)
      let networkBytesIn: number | null = null
      let networkBytesOut: number | null = null
      try {
        const podMetrics = await metricsClient.getPodMetrics()
        for (const pod of podMetrics.items) {
          for (const container of pod.containers ?? []) {
            const usage = container.usage as unknown as Record<string, string> | undefined
            if (usage?.['network.rx_bytes']) {
              networkBytesIn = (networkBytesIn ?? 0) + parseInt(usage['network.rx_bytes'], 10)
            }
            if (usage?.['network.tx_bytes']) {
              networkBytesOut = (networkBytesOut ?? 0) + parseInt(usage['network.tx_bytes'], 10)
            }
          }
        }
      } catch {
        // Network metrics not available — leave as null
      }

      const event: MetricsStreamEvent = {
        clusterId,
        timestamp: new Date().toISOString(),
        cpu: cpuPercent,
        memory: memPercent,
        pods: podsRes.items.length,
        networkBytesIn,
        networkBytesOut,
      }

      voyagerEmitter.emitMetricsStream(clusterId, event)
    } catch (err) {
      // Emit error event so client knows metrics are unavailable
      const event: MetricsStreamEvent = {
        clusterId,
        timestamp: new Date().toISOString(),
        cpu: null,
        memory: null,
        pods: null,
        networkBytesIn: null,
        networkBytesOut: null,
        error: {
          code: 'METRICS_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      }
      voyagerEmitter.emitMetricsStream(clusterId, event)
    }
  }
}

export const metricsStreamJob = new MetricsStreamJob()
