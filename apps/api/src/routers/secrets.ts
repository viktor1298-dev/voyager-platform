import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { mapSecret } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { authorizedProcedure, router } from '../trpc.js'

export const secretsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        // Read from WatchManager in-memory store when available
        const watchedSecrets = watchManager.getResources(input.clusterId, 'secrets')
        if (watchedSecrets) {
          return (watchedSecrets as k8s.V1Secret[]).map((secret) => mapSecret(secret))
        }

        // Fallback: fetch from K8s API via cached()
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const response = await cached(CACHE_KEYS.k8sSecrets(input.clusterId), 15, () =>
          coreV1.listSecretForAllNamespaces(),
        )

        return response.items.map((secret) => mapSecret(secret))
      } catch (err) {
        handleK8sError(err, 'list secrets')
      }
    }),
})
