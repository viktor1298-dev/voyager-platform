import { z } from 'zod'
import type { ResourceType } from '@voyager/types'
import { protectedProcedure, router } from '../trpc.js'
import { RESOURCE_DEFS, watchManager } from '../lib/watch-manager.js'

const resourceTypeEnum = z.enum([
  'pods', 'services', 'configmaps', 'secrets', 'pvcs', 'namespaces',
  'events', 'nodes', 'deployments', 'statefulsets', 'daemonsets',
  'jobs', 'cronjobs', 'hpa', 'ingresses', 'network-policies', 'resource-quotas',
] as const)

/**
 * Generic resources router — serves cached WatchManager data via HTTP.
 * Used by the frontend for instant initial load (before SSE connects).
 */
export const resourcesRouter = router({
  /**
   * Return cached snapshots for all watched resource types in a cluster.
   * Returns from the in-memory informer cache (~0ms).
   *
   * WatchManager keeps informers warm for 60s after the last subscriber
   * disconnects (grace period), so browser refresh gets instant cache.
   */
  snapshot: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(({ input }) => {
      const result: Record<string, unknown[]> = {}
      for (const def of RESOURCE_DEFS) {
        const resources = watchManager.getResources(input.clusterId, def.type)
        if (resources && resources.length > 0) {
          result[def.type] = resources.map((obj) => def.mapper(obj, input.clusterId))
        }
      }
      return result
    }),

  /**
   * Subscribe to specific resource types for a cluster.
   * Starts informers on-demand and returns when they are ready (initial list complete).
   */
  subscribe: protectedProcedure
    .input(z.object({
      clusterId: z.string().uuid(),
      types: z.array(resourceTypeEnum).min(1).max(17),
    }))
    .mutation(async ({ input }) => {
      const ready = await watchManager.ensureTypes(
        input.clusterId,
        input.types as ResourceType[],
      )
      return { ready }
    }),

  /**
   * Unsubscribe from specific resource types for a cluster.
   * Decrements reference counts; informers stop after grace period when refs hit zero.
   */
  unsubscribe: protectedProcedure
    .input(z.object({
      clusterId: z.string().uuid(),
      types: z.array(resourceTypeEnum).min(1).max(17),
    }))
    .mutation(({ input }) => {
      watchManager.releaseTypes(input.clusterId, input.types as ResourceType[])
      return { ok: true }
    }),
})
