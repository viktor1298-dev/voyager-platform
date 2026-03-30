import { useCallback, useEffect, useState } from 'react'
import type { ResourceType } from '@voyager/types'
import { useResourceStore, type ConnectionState } from '@/stores/resource-store'

export type { ConnectionState }

/** Stable empty array reference — prevents Zustand selector infinite loop */
const EMPTY: unknown[] = []

/**
 * Read resources for a specific cluster + type from the Zustand store.
 *
 * Includes a local 5-second tick that forces the consuming component to
 * re-render so relative time labels ("3s ago" → "8s ago") stay current
 * even when no SSE events arrive. The tick uses React local state (useState)
 * because Zustand's subscribeWithSelector suppresses re-renders when
 * the selected slice hasn't changed.
 */
export function useClusterResources<T>(clusterId: string, type: ResourceType): T[] {
  // Local tick forces periodic re-renders for relative time updates.
  // useState + setInterval is immune to Zustand's selector equality checks.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(timer)
  }, [])

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
