import { useCallback, useEffect } from 'react'
import type { ResourceType } from '@voyager/types'
import { useResourceStore, type ConnectionState } from '@/stores/resource-store'

export type { ConnectionState }

/** Stable empty array reference — prevents Zustand selector infinite loop */
const EMPTY: unknown[] = []

/**
 * Read resources for a specific cluster + type from the Zustand store.
 *
 * Re-renders are driven by the global `tick` counter in the Zustand store,
 * which is incremented every 5 seconds by `useResourceTick()` (placed once
 * in the cluster layout). This keeps relative time labels ("3s ago" → "8s ago")
 * current without each hook instance running its own setInterval.
 *
 * Previous implementation: each call site had a local 1-second setInterval,
 * causing 46+ timer callbacks/second and massive unnecessary re-renders.
 * Now all consumers share a single 5-second global tick.
 */
export function useClusterResources<T>(clusterId: string, type: ResourceType): T[] {
  // Subscribe to global tick — forces re-render for relative time updates
  // without each hook instance running its own setInterval.
  // The tick is incremented every 5s by useResourceTick() in the cluster layout.
  useResourceStore((s) => s.tick)

  return useResourceStore(
    useCallback(
      (s) => (s.resources.get(`${clusterId}:${type}`) ?? EMPTY) as T[],
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
 * Check if a cluster has received at least one SSE snapshot.
 * Use to distinguish "connected but waiting for data" from "connected and data is empty".
 * Pages should show loading skeleton when connected && !snapshotsReady.
 */
export function useSnapshotsReady(clusterId: string): boolean {
  return useResourceStore(useCallback((s) => s.snapshotsReady.has(clusterId), [clusterId]))
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
