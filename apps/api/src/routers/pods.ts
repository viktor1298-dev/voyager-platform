import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

export const podsRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const podsResponse = await cached(CACHE_KEYS.k8sPods(input.clusterId), 15_000, () =>
          coreV1.listPodForAllNamespaces(),
        )

        // Fetch pod metrics for CPU/Memory usage
        let podMetricsMap = new Map<string, { cpuNano: number; memBytes: number }>()
        try {
          const metricsClient = new k8s.Metrics(kc)
          const podMetrics = await cached(CACHE_KEYS.k8sPodMetrics(input.clusterId), 15_000, () =>
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

        return podsResponse.items.map((p) => {
          const podKey = `${p.metadata?.namespace ?? ''}/${p.metadata?.name ?? ''}`
          const metrics = podMetricsMap.get(podKey)
          // Calculate CPU/Mem percent based on requests
          const cpuRequestNano = (p.spec?.containers ?? []).reduce(
            (sum, c) => sum + parseCpuToNano(c.resources?.requests?.cpu ?? '0'),
            0,
          )
          const memRequestBytes = (p.spec?.containers ?? []).reduce(
            (sum, c) => sum + parseMemToBytes(c.resources?.requests?.memory ?? '0'),
            0,
          )
          return {
            name: p.metadata?.name ?? '',
            namespace: p.metadata?.namespace ?? '',
            status: p.status?.phase ?? 'Unknown',
            createdAt: p.metadata?.creationTimestamp
              ? new Date(p.metadata.creationTimestamp as unknown as string).toISOString()
              : null,
            nodeName: p.spec?.nodeName ?? null,
            cpuMillis: metrics ? Math.round(metrics.cpuNano / 1_000_000) : null,
            memoryMi: metrics ? Math.round(metrics.memBytes / (1024 * 1024)) : null,
            cpuPercent:
              metrics && cpuRequestNano > 0
                ? Math.round((metrics.cpuNano / cpuRequestNano) * 1000) / 10
                : null,
            memoryPercent:
              metrics && memRequestBytes > 0
                ? Math.round((metrics.memBytes / memRequestBytes) * 1000) / 10
                : null,
          }
        })
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
        await logAudit(ctx, 'pod.delete', 'pod', `${input.namespace}/${input.podName}`, {
          clusterId: input.clusterId,
          namespace: input.namespace,
          podName: input.podName,
        })
        return { success: true, podName: input.podName }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete pod ${input.podName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),
})
