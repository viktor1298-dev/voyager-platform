import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { mapCronJob } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { authorizedProcedure, router } from '../trpc.js'

export const cronJobsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        // Read from WatchManager in-memory store when available
        const watchedCronJobs = watchManager.getResources(input.clusterId, 'cronjobs')
        if (watchedCronJobs) {
          return (watchedCronJobs as k8s.V1CronJob[]).map((cj) => mapCronJob(cj))
        }

        // Fallback: fetch from K8s API via cached()
        const kc = await clusterClientPool.getClient(input.clusterId)
        const batchV1 = kc.makeApiClient(k8s.BatchV1Api)

        const response = await cached(CACHE_KEYS.k8sCronJobs(input.clusterId), 15, () =>
          batchV1.listCronJobForAllNamespaces(),
        )

        return response.items.map((cj) => mapCronJob(cj))
      } catch (err) {
        handleK8sError(err, 'list cronjobs')
      }
    }),
})
