import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { cached, invalidateKey } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'
import { mapPod } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

export const podsRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)

        // Fetch pod metrics separately (Metrics API is NOT watchable)
        const podMetricsMap = new Map<string, { cpuNano: number; memBytes: number }>()
        try {
          const metricsClient = new k8s.Metrics(kc)
          const podMetrics = await cached(CACHE_KEYS.k8sPodMetrics(input.clusterId), 15, () =>
            metricsClient.getPodMetrics(''),
          )
          for (const pm of podMetrics.items) {
            const key = `${pm.metadata?.namespace}/${pm.metadata?.name}`
            let totalCpu = 0
            let totalMem = 0
            for (const container of pm.containers ?? []) {
              totalCpu += parseCpuToNano(container.usage?.cpu ?? '0')
              totalMem += parseMemToBytes(container.usage?.memory ?? '0')
            }
            podMetricsMap.set(key, { cpuNano: totalCpu, memBytes: totalMem })
          }
        } catch {
          // metrics-server may not be available
        }

        // Read pods from WatchManager in-memory store when available
        if (watchManager.isWatching(input.clusterId)) {
          const rawPods = watchManager.getResources(input.clusterId, 'pods') as k8s.V1Pod[]
          return rawPods.map((p) => mapPod(p, podMetricsMap))
        }

        // Fallback: fetch from K8s API via cached()
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const podsResponse = await cached(CACHE_KEYS.k8sPods(input.clusterId), 15, () =>
          coreV1.listPodForAllNamespaces(),
        )
        return podsResponse.items.map((p) => mapPod(p, podMetricsMap))
      } catch (err) {
        handleK8sError(err, 'list pods')
      }
    }),

  listStored: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(
      z.object({
        pods: z.array(z.any()),
        offline: z.boolean(),
        lastSeen: z.string().nullable(),
      }),
    )
    .query(async ({ input }) => {
      try {
        // Attempt live K8s fetch first
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const podsResponse = await cached(CACHE_KEYS.k8sPodsStored(input.clusterId), 15, () =>
          coreV1.listPodForAllNamespaces(),
        )

        return {
          pods: podsResponse.items.map((p) => ({
            name: p.metadata?.name ?? '',
            namespace: p.metadata?.namespace ?? '',
            status: p.status?.phase ?? 'Unknown',
            createdAt: p.metadata?.creationTimestamp
              ? new Date(p.metadata.creationTimestamp as unknown as string).toISOString()
              : null,
            nodeName: p.spec?.nodeName ?? null,
          })),
          offline: false,
          lastSeen: new Date().toISOString(),
        }
      } catch {
        // Cluster is offline or unreachable — return graceful degradation (BUG-RD-004)
        return {
          pods: [] as Array<{
            name: string
            namespace: string
            status: string
            createdAt: string | null
            nodeName: string | null
          }>,
          offline: true,
          lastSeen: null,
        }
      }
    }),

  delete: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        namespace: z.string(),
        podName: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreApi = kc.makeApiClient(k8s.CoreV1Api)
        await coreApi.deleteNamespacedPod({ name: input.podName, namespace: input.namespace })
      } catch (err) {
        // 404 = pod already gone, treat as success
        const is404 =
          err instanceof Error && (err.message.includes('404') || err.message.includes('NotFound'))
        if (!is404) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to delete pod ${input.podName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          })
        }
      }
      // Invalidate pod caches so next list query fetches fresh data
      await Promise.all([
        invalidateKey(CACHE_KEYS.k8sPods(input.clusterId)),
        invalidateKey(CACHE_KEYS.k8sPodsStored(input.clusterId)),
        invalidateKey(CACHE_KEYS.k8sPodMetrics(input.clusterId)),
      ])
      try {
        await logAudit(ctx, 'pod.delete', 'pod', `${input.namespace}/${input.podName}`, {
          clusterId: input.clusterId,
          namespace: input.namespace,
          podName: input.podName,
        })
      } catch {
        /* audit must not break the operation */
      }
      return { success: true, podName: input.podName }
    }),
})
