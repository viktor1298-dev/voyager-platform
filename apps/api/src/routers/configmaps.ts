import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { mapConfigMap } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { authorizedProcedure, router } from '../trpc.js'

export const configMapsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        // Read from WatchManager in-memory store when available
        const watchedConfigMaps = watchManager.getResources(input.clusterId, 'configmaps')
        if (watchedConfigMaps) {
          return (watchedConfigMaps as k8s.V1ConfigMap[]).map((cm) => mapConfigMap(cm))
        }

        // Fallback: fetch from K8s API via cached()
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const response = await cached(`k8s:${input.clusterId}:configmaps`, 15, () =>
          coreV1.listConfigMapForAllNamespaces(),
        )

        return response.items.map((cm) => mapConfigMap(cm))
      } catch (err) {
        handleK8sError(err, 'list configmaps')
      }
    }),
})
