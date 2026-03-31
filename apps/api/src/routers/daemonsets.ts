import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { cached, getRedisClient } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { mapDaemonSet } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { adminProcedure, authorizedProcedure, router } from '../trpc.js'

export const daemonSetsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        // Read from WatchManager in-memory store when available
        const watchedDaemonSets = watchManager.getResources(input.clusterId, 'daemonsets')
        if (watchedDaemonSets) {
          return (watchedDaemonSets as k8s.V1DaemonSet[]).map((ds) => mapDaemonSet(ds))
        }

        // Fallback: fetch from K8s API via cached()
        const kc = await clusterClientPool.getClient(input.clusterId)
        const appsV1 = kc.makeApiClient(k8s.AppsV1Api)

        const response = await cached(CACHE_KEYS.k8sDaemonSets(input.clusterId), 15, () =>
          appsV1.listDaemonSetForAllNamespaces(),
        )

        return response.items.map((ds) => mapDaemonSet(ds))
      } catch (err) {
        handleK8sError(err, 'list daemonsets')
      }
    }),

  restart: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        name: z.string(),
        namespace: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        const now = new Date().toISOString()
        await api.patchNamespacedDaemonSet({
          name: input.name,
          namespace: input.namespace,
          body: {
            spec: {
              template: {
                metadata: {
                  annotations: { 'kubectl.kubernetes.io/restartedAt': now },
                },
              },
            },
          },
        })
        const redis = await getRedisClient()
        if (redis) await redis.del(CACHE_KEYS.k8sDaemonSets(input.clusterId))
        await logAudit(ctx, 'daemonset.restart', 'daemonset', `${input.namespace}/${input.name}`, {
          clusterId: input.clusterId,
          namespace: input.namespace,
        })
        return { success: true, restartedAt: now }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to restart daemonset ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),

  delete: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        name: z.string(),
        namespace: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        await api.deleteNamespacedDaemonSet({
          name: input.name,
          namespace: input.namespace,
        })
        const redis = await getRedisClient()
        if (redis) await redis.del(CACHE_KEYS.k8sDaemonSets(input.clusterId))
        await logAudit(ctx, 'daemonset.delete', 'daemonset', `${input.namespace}/${input.name}`, {
          clusterId: input.clusterId,
          namespace: input.namespace,
        })
        return { success: true }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete daemonset ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),
})
