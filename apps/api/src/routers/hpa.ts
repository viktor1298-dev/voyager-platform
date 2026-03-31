import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { mapHPA } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { authorizedProcedure, router } from '../trpc.js'

export const hpaRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        // Read from WatchManager in-memory store when available
        const watchedHPAs = watchManager.getResources(input.clusterId, 'hpa')
        if (watchedHPAs) {
          return (watchedHPAs as k8s.V2HorizontalPodAutoscaler[]).map((hpa) => mapHPA(hpa))
        }

        // Fallback: fetch from K8s API via cached()
        const kc = await clusterClientPool.getClient(input.clusterId)
        const autoscalingV2 = kc.makeApiClient(k8s.AutoscalingV2Api)

        const response = await cached(CACHE_KEYS.k8sHpa(input.clusterId), 15, () =>
          autoscalingV2.listHorizontalPodAutoscalerForAllNamespaces(),
        )

        return response.items.map((hpa) => mapHPA(hpa))
      } catch (err) {
        handleK8sError(err, 'list hpa')
      }
    }),
})
