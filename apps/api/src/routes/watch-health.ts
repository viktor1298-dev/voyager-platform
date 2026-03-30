/**
 * Watch health endpoint — returns which clusters have active watches
 * and how many informer types are configured.
 *
 * GET /api/watches/health (auth-bypassed, like /health)
 */
import type { FastifyInstance } from 'fastify'
import { RESOURCE_DEFS, watchManager } from '../lib/watch-manager.js'

export async function registerWatchHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/watches/health', async () => {
    const activeIds = watchManager.getActiveClusterIds()
    return {
      activeWatches: activeIds.map((id) => ({
        clusterId: id,
        watching: true,
      })),
      totalWatchedClusters: activeIds.length,
      totalResourceTypes: RESOURCE_DEFS.length,
    }
  })
}
