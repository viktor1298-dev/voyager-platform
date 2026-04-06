import { useCallback, useEffect, useRef } from 'react'
import type { ResourceType } from '@voyager/types'
import { useResourceStore, type ConnectionState } from '@/stores/resource-store'

export type { ConnectionState }

/** Stable empty array reference — prevents Zustand selector infinite loop */
const EMPTY: unknown[] = []

/**
 * Read resources for a specific cluster + type from the Zustand store.
 *
 * The store holds Map-of-Maps internally (outer key → inner Map keyed by
 * namespace/name). This selector converts inner Map values to an array,
 * caching the result by inner Map reference to avoid creating a new array
 * on every selector call (which would cause infinite re-renders).
 *
 * Re-renders are additionally driven by the global `tick` counter (incremented
 * every 5s by `useResourceTick()`) for relative time label freshness.
 */
export function useClusterResources<T>(clusterId: string, type: ResourceType): T[] {
  // Subscribe to global tick — forces re-render for relative time updates
  // without each hook instance running its own setInterval.
  // The tick is incremented every 5s by useResourceTick() in the cluster layout.
  useResourceStore((s) => s.tick)

  const prevRef = useRef<{ map: Map<string, unknown> | undefined; arr: unknown[] }>({
    map: undefined,
    arr: EMPTY,
  })

  return useResourceStore(
    useCallback(
      (s) => {
        const inner = s.resources.get(`${clusterId}:${type}`)
        if (!inner || inner.size === 0) return EMPTY as T[]
        // Only rebuild array if the inner Map reference changed
        if (inner === prevRef.current.map) return prevRef.current.arr as T[]
        const arr = [...inner.values()] as T[]
        prevRef.current = { map: inner, arr }
        return arr
      },
      [clusterId, type],
    ),
  )
}

/**
 * Read connection state for a specific cluster from the Zustand store.
 * Returns 'disconnected' as default if the cluster has no state entry.
 */
export function useConnectionState(clusterId: string): ConnectionState {
  return useResourceStore(
    useCallback((s) => s.connectionState[clusterId] ?? 'disconnected', [clusterId]),
  )
}

/**
 * Check if a specific resource type for a cluster has received at least one SSE snapshot.
 * Use to distinguish "connected but waiting for data" from "connected and data is empty".
 * Pages should show loading skeleton when connected && !snapshotsReady.
 */
export function useSnapshotsReady(clusterId: string, type?: ResourceType): boolean {
  return useResourceStore(
    useCallback(
      (s) => {
        if (type) return s.snapshotsReady.has(`${clusterId}:${type}`)
        // Backward compat: if no type, check if ANY type for this cluster is ready
        for (const key of s.snapshotsReady) {
          if (key.startsWith(`${clusterId}:`)) return true
        }
        return false
      },
      [clusterId, type],
    ),
  )
}

/**
 * Connection-aware loading check for resource pages.
 * Returns true when a loading skeleton should be shown instead of empty state.
 *
 * Logic:
 * - connected + snapshotsReady + empty data → false (genuinely empty cluster)
 * - connected + !snapshotsReady + empty data → true (waiting for snapshot)
 * - reconnecting/disconnected + empty data → true (data unavailable)
 * - any state + data present → false (show data, stale during reconnect = D-01)
 */
export function useResourceLoading(clusterId: string, type: ResourceType, dataLength: number): boolean {
  const snapshotsReady = useSnapshotsReady(clusterId, type)
  const connectionState = useConnectionState(clusterId)
  return dataLength === 0 && (!snapshotsReady || connectionState !== 'connected')
}

/**
 * Start the 5-second tick timer that drives relative time re-renders.
 * Place this ONCE in the cluster layout — it drives all useClusterResources consumers.
 * Without this, "3s ago" labels freeze until the next K8s event arrives.
 */
export function useResourceTick(): void {
  const incrementTick = useResourceStore((s) => s.incrementTick)

  useEffect(() => {
    const timer = setInterval(incrementTick, 5_000)
    return () => clearInterval(timer)
  }, [incrementTick])
}
