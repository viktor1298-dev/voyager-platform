import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { mapIngress } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { authorizedProcedure, router } from '../trpc.js'

export const ingressesRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        // Read from WatchManager in-memory store when available
        const watchedIngresses = watchManager.getResources(input.clusterId, 'ingresses')
        if (watchedIngresses) {
          return (watchedIngresses as k8s.V1Ingress[]).map((ing) => mapIngress(ing))
        }

        // Fallback: fetch from K8s API via cached()
        const kc = await clusterClientPool.getClient(input.clusterId)
        const networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api)

        const response = await cached(`k8s:${input.clusterId}:ingresses`, 15, () =>
          networkingV1.listIngressForAllNamespaces(),
        )

        return response.items.map((ing) => mapIngress(ing))
      } catch (err) {
        handleK8sError(err, 'list ingresses')
      }
    }),
})
