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
   *
   * Ensures informers are running (calls subscribe, ref-counted) and waits
   * up to 3 seconds for at least one resource type to become available.
   * Returns whatever is cached — even partial data is better than nothing.
   *
   * Response shape: Record<ResourceType, unknown[]>
   */
  snapshot: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { clusterId } = input

      // Ensure informers are running (idempotent — increments ref count)
      await watchManager.subscribe(clusterId)

      // Try to read cached data, waiting briefly if informers are still initializing
      let result = readCache(clusterId)
      if (Object.keys(result).length === 0) {
        // Informers just started — poll briefly for data to appear
        for (let i = 0; i < 6; i++) {
          await sleep(500)
          result = readCache(clusterId)
          if (Object.keys(result).length > 0) break
        }
      }

      // Balance ref count — SSE will take over with its own subscribe
      watchManager.unsubscribe(clusterId)

      return result
    }),
})

function readCache(clusterId: string): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {}
  for (const def of RESOURCE_DEFS) {
    const resources = watchManager.getResources(clusterId, def.type)
    if (resources && resources.length > 0) {
      result[def.type] = resources.map((obj) => def.mapper(obj, clusterId))
    }
  }
  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
