import * as k8s from '@kubernetes/client-node'
import { clusters, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { ZodError } from 'zod'
import { clusterClientPool } from '../lib/cluster-client-pool.js'

type SyncHealthStatus = 'healthy' | 'warning' | 'error' | 'unknown'

const HEALTH_SYNC_INTERVAL_MS = 5 * 60 * 1000
const HEALTH_SYNC_CONCURRENCY = 10

function deriveHealthStatus(nodeCount: number, totalPods: number, runningPods: number): SyncHealthStatus {
  if (nodeCount <= 0) return 'error'
  if (totalPods === 0 || runningPods === totalPods) return 'healthy'
  if (runningPods > 0) return 'warning'
  return 'error'
}

async function syncClusterHealth(clusterId: string): Promise<void> {
  const now = new Date()

  try {
    const kc = await clusterClientPool.getClient(clusterId)
    const coreV1Api = kc.makeApiClient(k8s.CoreV1Api)
    const versionApi = kc.makeApiClient(k8s.VersionApi)

    const [versionRes, nodesRes, podsRes] = await Promise.all([
      versionApi.getCode(),
      coreV1Api.listNode(),
      coreV1Api.listPodForAllNamespaces(),
    ])

    const totalNodes = nodesRes.items.length
    const runningPods = podsRes.items.filter((pod) => pod.status?.phase === 'Running').length
    const totalPods = podsRes.items.length
    const healthStatus = deriveHealthStatus(totalNodes, totalPods, runningPods)

    await db
      .update(clusters)
      .set({
        healthStatus: (healthStatus === 'warning' ? 'degraded' : healthStatus === 'error' ? 'unreachable' : healthStatus) as
          | 'healthy'
          | 'degraded'
          | 'unreachable'
          | 'unknown',
        status: 'active',
        version: `v${versionRes.major}.${versionRes.minor}`,
        nodesCount: totalNodes,
        lastHealthCheck: now,
        lastConnectedAt: now,
      })
      .where(eq(clusters.id, clusterId))
  } catch (error) {
    if (error instanceof ZodError) {
      console.warn(`[health-sync] cluster ${clusterId} skipped — invalid connectionConfig`, error.issues)
    } else {
      console.error(`[health-sync] cluster ${clusterId} sync failed`, error)
    }

    await db
      .update(clusters)
      .set({
        healthStatus: 'unreachable',
        status: 'unreachable',
        lastHealthCheck: now,
      })
      .where(eq(clusters.id, clusterId))
  }
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0

  const runWorker = async (): Promise<void> => {
    while (index < items.length) {
      const current = items[index++]
      if (!current) return
      await worker(current)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  await Promise.allSettled(workers)
}

let intervalHandle: NodeJS.Timeout | null = null
let isRunning = false

export function startHealthSync(): void {
  if (intervalHandle) return

  const run = async () => {
    if (isRunning) return
    isRunning = true

    try {
      const allClusters = await db.select().from(clusters)
      const activeClusters = allClusters.filter((cluster) => cluster.isActive)

      await mapWithConcurrency(activeClusters, HEALTH_SYNC_CONCURRENCY, async (cluster) => {
        await syncClusterHealth(cluster.id)
      })
    } catch (error) {
      console.error('[health-sync] job run failed', error)
    } finally {
      isRunning = false
    }
  }

  void run()
  intervalHandle = setInterval(() => {
    void run()
  }, HEALTH_SYNC_INTERVAL_MS)
}
