import { useCallback } from 'react'
import type { ResourceType } from '@voyager/types'
import { useResourceStore, type ConnectionState } from '@/stores/resource-store'

export type { ConnectionState }

/** Stable empty array reference — prevents Zustand selector infinite loop */
const EMPTY: unknown[] = []

/**
 * Read resources for a specific cluster + type from the Zustand store.
 * Uses a memoized selector so only components watching this (clusterId, type)
 * pair re-render when that specific data changes.
 */
export function useClusterResources<T>(clusterId: string, type: ResourceType): T[] {
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
