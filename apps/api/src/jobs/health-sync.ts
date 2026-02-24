import { clusters, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { clusterClientPool } from '../lib/cluster-client-pool.js'

type SyncHealthStatus = 'healthy' | 'warning' | 'error' | 'unknown'

const HEALTH_SYNC_INTERVAL_MS = 5 * 60 * 1000

function deriveHealthStatus(nodeCount: number, totalPods: number, runningPods: number): SyncHealthStatus {
  if (nodeCount <= 0) return 'error'
  if (totalPods === 0 || runningPods === totalPods) return 'healthy'
  if (runningPods > 0) return 'warning'
  return 'error'
}

async function syncClusterHealth(clusterId: string): Promise<void> {
  const now = new Date()

  try {
    const { coreV1Api, versionApi } = await clusterClientPool.getClient(clusterId)

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
        version: `v${versionRes.major}.${versionRes.minor}`,
        nodesCount: totalNodes,
        lastHealthCheck: now,
        ...( { lastConnectedAt: now } as Record<string, Date>),
      })
      .where(eq(clusters.id, clusterId))
  } catch (error) {
    console.error(`[health-sync] cluster ${clusterId} sync failed`, error)

    await db
      .update(clusters)
      .set({
        healthStatus: 'unreachable',
        lastHealthCheck: now,
      })
      .where(eq(clusters.id, clusterId))
  }
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
      const activeClusters = allClusters.filter((cluster) => {
        const maybeActive = (cluster as Record<string, unknown>).isActive
        return typeof maybeActive === 'boolean' ? maybeActive : true
      })

      await Promise.all(activeClusters.map((cluster) => syncClusterHealth(cluster.id)))
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
