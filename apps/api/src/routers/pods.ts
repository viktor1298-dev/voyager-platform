import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { getCoreV1Api } from '../lib/k8s.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { cached } from '../lib/cache.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

export const podsRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const cachePrefix = `k8s:${input.clusterId}`
        const podsResponse = await cached(`${cachePrefix}:pods`, 15_000, () =>
          coreV1.listPodForAllNamespaces(),
        )
        return podsResponse.items.map((p) => ({
          name: p.metadata?.name ?? '',
          namespace: p.metadata?.namespace ?? '',
          status: p.status?.phase ?? 'Unknown',
          createdAt: p.metadata?.creationTimestamp
            ? new Date(p.metadata.creationTimestamp as unknown as string).toISOString()
            : null,
          nodeName: p.spec?.nodeName ?? null,
        }))
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list pods: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),

  delete: adminProcedure
    .input(z.object({
      namespace: z.string(),
      podName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const coreApi = getCoreV1Api()
        await coreApi.deleteNamespacedPod({ name: input.podName, namespace: input.namespace })
        await logAudit(ctx, 'pod.delete', 'pod', `${input.namespace}/${input.podName}`, {
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
