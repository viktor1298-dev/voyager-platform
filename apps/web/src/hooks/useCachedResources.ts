'use client'

import { useEffect } from 'react'
import type { ResourceType } from '@voyager/types'
import { trpc } from '@/lib/trpc'
import { useResourceStore } from '@/stores/resource-store'

/**
 * Seed the resource store with cached data from the API server (via tRPC HTTP).
 *
 * Called once in the cluster layout alongside useResourceSSE. While SSE takes
 * seconds to establish, this HTTP fetch returns cached WatchManager data in ~50ms,
 * giving instant page content instead of loading skeletons.
 *
 * Once SSE connects and sends its own snapshots, SSE data overwrites the
 * tRPC-seeded data — same mappers, same shapes, no conflict.
 */
export function useCachedResources(clusterId: string | null) {
  const { data } = trpc.resources.snapshot.useQuery(
    { clusterId: clusterId! },
    {
      enabled: !!clusterId,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  )

  useEffect(() => {
    if (!data || !clusterId) return
    const store = useResourceStore.getState()
    // Only seed if store doesn't already have data for this cluster
    // (SSE snapshots take priority once connected)
    if (store.snapshotsReady.has(clusterId)) return

    for (const [type, items] of Object.entries(data)) {
      if (Array.isArray(items) && items.length > 0) {
        store.setResources(clusterId, type as ResourceType, items)
      }
    }
  }, [data, clusterId])
}
