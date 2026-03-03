import * as k8s from '@kubernetes/client-node'
import { clusters, db, metricsHistory } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'

const COLLECT_INTERVAL_MS = 60 * 1000

let intervalHandle: NodeJS.Timeout | null = null
let isRunning = false

async function collectMetrics(): Promise<void> {
  const allClusters = await db
    .select({ id: clusters.id })
    .from(clusters)
    .where(eq(clusters.isActive, true))

  for (const cluster of allClusters) {
    try {
      const kc = await clusterClientPool.getClient(cluster.id)
      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      const metricsClient = new k8s.Metrics(kc)

      const [nodeMetrics, nodesRes, podsRes] = await Promise.all([
        metricsClient.getNodeMetrics(),
        coreApi.listNode(),
        coreApi.listPodForAllNamespaces(),
      ])

      let totalCpuUsageNano = 0
      let totalMemUsageBytes = 0
      let totalCpuAllocatable = 0
      let totalMemAllocatable = 0

      const allocMap = new Map<string, { cpu: number; mem: number }>()
      for (const node of nodesRes.items) {
        const name = node.metadata?.name
        if (name) {
          allocMap.set(name, {
            cpu: parseCpuToNano(node.status?.allocatable?.cpu ?? '0'),
            mem: parseMemToBytes(node.status?.allocatable?.memory ?? '0'),
          })
        }
      }

      for (const nm of nodeMetrics.items) {
        totalCpuUsageNano += parseCpuToNano(nm.usage?.cpu ?? '0')
        totalMemUsageBytes += parseMemToBytes(nm.usage?.memory ?? '0')
        const alloc = allocMap.get(nm.metadata?.name ?? '')
        if (alloc) {
          totalCpuAllocatable += alloc.cpu
          totalMemAllocatable += alloc.mem
        }
      }

      const cpuPercent = totalCpuAllocatable > 0
        ? Math.round((totalCpuUsageNano / totalCpuAllocatable) * 1000) / 10
        : 0
      const memPercent = totalMemAllocatable > 0
        ? Math.round((totalMemUsageBytes / totalMemAllocatable) * 1000) / 10
        : 0

      await db.insert(metricsHistory).values({
        clusterId: cluster.id,
        cpuPercent,
        memPercent,
        podCount: podsRes.items.length,
        nodeCount: nodesRes.items.length,
      })
    } catch (err) {
      console.warn(`[metrics-collector] failed for cluster ${cluster.id}`, err)
    }
  }
}

export function startMetricsHistoryCollector(): void {
  if (intervalHandle) return

  const run = async () => {
    if (isRunning) return
    isRunning = true
    try {
      await collectMetrics()
    } catch (error) {
      console.error('[metrics-collector] job run failed', error)
    } finally {
      isRunning = false
    }
  }

  void run()
  intervalHandle = setInterval(() => { void run() }, COLLECT_INTERVAL_MS)
}

export function stopMetricsHistoryCollector(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
