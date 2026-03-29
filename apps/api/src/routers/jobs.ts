import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { mapJob } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { authorizedProcedure, router } from '../trpc.js'

export const jobsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        // Read from WatchManager in-memory store when available
        if (watchManager.isWatching(input.clusterId)) {
          const raw = watchManager.getResources(input.clusterId, 'jobs') as k8s.V1Job[]
          return raw.map((job) => mapJob(job))
        }

        // Fallback: fetch from K8s API via cached()
        const kc = await clusterClientPool.getClient(input.clusterId)
        const batchV1 = kc.makeApiClient(k8s.BatchV1Api)

        const response = await cached(`k8s:${input.clusterId}:jobs`, 15, () =>
          batchV1.listJobForAllNamespaces(),
        )

        return response.items.map((job) => mapJob(job))
      } catch (err) {
        handleK8sError(err, 'list jobs')
      }
    }),
})
