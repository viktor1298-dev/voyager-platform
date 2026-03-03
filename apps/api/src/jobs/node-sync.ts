import * as k8s from '@kubernetes/client-node'
import { clusters, db, nodes } from '@voyager/db'
import { eq, and } from 'drizzle-orm'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'

const SYNC_INTERVAL_MS = 5 * 60 * 1000

let intervalHandle: NodeJS.Timeout | null = null
let isRunning = false

async function syncNodes(): Promise<void> {
  const allClusters = await db
    .select({ id: clusters.id })
    .from(clusters)
    .where(eq(clusters.isActive, true))

  for (const cluster of allClusters) {
    try {
      const kc = await clusterClientPool.getClient(cluster.id)
      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      const nodesRes = await coreApi.listNode()

      // Fetch all pods ONCE and build a per-node count map (avoid N+1 API calls)
      const podCountByNode = new Map<string, number>()
      try {
        const allPods = await coreApi.listPodForAllNamespaces()
        for (const pod of allPods.items) {
          const nodeName = pod.spec?.nodeName
          if (nodeName) {
            podCountByNode.set(nodeName, (podCountByNode.get(nodeName) ?? 0) + 1)
          }
        }
      } catch { /* ignore — pod counts will default to 0 */ }

      for (const node of nodesRes.items) {
        const name = node.metadata?.name ?? 'unknown'
        const conditions = node.status?.conditions ?? []
        const readyCondition = conditions.find((c) => c.type === 'Ready')
        const status = readyCondition?.status === 'True' ? 'Ready' : 'NotReady'
        const labels = node.metadata?.labels ?? {}
        const role = labels['node-role.kubernetes.io/control-plane'] !== undefined
          ? 'control-plane'
          : 'worker'

        const cpuCap = node.status?.capacity?.cpu
        const cpuAlloc = node.status?.allocatable?.cpu
        const memCap = node.status?.capacity?.memory
        const memAlloc = node.status?.allocatable?.memory

        // Convert to millicores for CPU columns
        const cpuCapMilli = cpuCap ? Math.round(parseCpuToNano(cpuCap) / 1_000_000) : null
        const cpuAllocMilli = cpuAlloc ? Math.round(parseCpuToNano(cpuAlloc) / 1_000_000) : null
        const memCapBytes = memCap ? parseMemToBytes(memCap) : null
        const memAllocBytes = memAlloc ? parseMemToBytes(memAlloc) : null

        const k8sVersion = node.status?.nodeInfo?.kubeletVersion ?? null

        const podsCount = podCountByNode.get(name) ?? 0

        // Upsert: find existing by clusterId + name
        const existing = await db
          .select({ id: nodes.id })
          .from(nodes)
          .where(and(eq(nodes.clusterId, cluster.id), eq(nodes.name, name)))
          .limit(1)

        if (existing.length > 0) {
          await db
            .update(nodes)
            .set({
              status,
              role,
              cpuCapacity: cpuCapMilli,
              cpuAllocatable: cpuAllocMilli,
              memoryCapacity: memCapBytes,
              memoryAllocatable: memAllocBytes,
              podsCount,
              k8sVersion,
            })
            .where(eq(nodes.id, existing[0].id))
        } else {
          await db.insert(nodes).values({
            clusterId: cluster.id,
            name,
            status,
            role,
            cpuCapacity: cpuCapMilli,
            cpuAllocatable: cpuAllocMilli,
            memoryCapacity: memCapBytes,
            memoryAllocatable: memAllocBytes,
            podsCount,
            k8sVersion,
          })
        }
      }
    } catch (err) {
      console.warn(`[node-sync] failed for cluster ${cluster.id}`, err)
    }
  }
}

export function startNodeSync(): void {
  if (intervalHandle) return

  const run = async () => {
    if (isRunning) return
    isRunning = true
    try {
      await syncNodes()
    } catch (error) {
      console.error('[node-sync] job run failed', error)
    } finally {
      isRunning = false
    }
  }

  void run()
  intervalHandle = setInterval(() => { void run() }, SYNC_INTERVAL_MS)
}

export function stopNodeSync(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
