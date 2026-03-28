import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

export const resourceQuotasRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const response = await cached(CACHE_KEYS.k8sResourceQuotas(input.clusterId), 15_000, () =>
          coreV1.listResourceQuotaForAllNamespaces(),
        )

        return response.items.map((rq) => ({
          name: rq.metadata?.name ?? '',
          namespace: rq.metadata?.namespace ?? '',
          hard: (rq.status?.hard as Record<string, string>) ?? {},
          used: (rq.status?.used as Record<string, string>) ?? {},
          createdAt: rq.metadata?.creationTimestamp
            ? new Date(rq.metadata.creationTimestamp as unknown as string).toISOString()
            : null,
          labels: (rq.metadata?.labels as Record<string, string>) ?? {},
        }))
      } catch (err) {
        handleK8sError(err, 'list resource quotas')
      }
    }),
})
