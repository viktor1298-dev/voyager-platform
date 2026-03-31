import { z } from 'zod'
import { protectedProcedure, router } from '../trpc.js'
import { RESOURCE_DEFS, watchManager } from '../lib/watch-manager.js'

/**
 * Generic resources router — serves cached WatchManager data via HTTP.
 * Used by the frontend for instant initial load (before SSE connects).
 */
export const resourcesRouter = router({
  /**
   * Return cached snapshots for all watched resource types in a cluster.
   * Returns data from the in-memory informer cache (~0ms) — same data
   * the SSE resource-stream sends as `snapshot` events.
   *
   * Response shape: Record<ResourceType, unknown[]>
   * Only includes types that have cached data (informer ready).
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
})
