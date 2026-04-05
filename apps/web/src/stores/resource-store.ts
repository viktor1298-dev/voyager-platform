import { create } from 'zustand'
import type { ResourceType, WatchEvent } from '@voyager/types'

export type ConnectionState = 'initializing' | 'connected' | 'reconnecting' | 'disconnected'

/** Derive a stable key from a K8s resource object (namespace/name or just name) */
function resourceKey(obj: { name: string; namespace?: string | null }): string {
  return obj.namespace ? `${obj.namespace}/${obj.name}` : obj.name
}

interface ResourceStoreState {
  /** Keyed by `${clusterId}:${resourceType}` → inner Map keyed by `namespace/name` */
  resources: Map<string, Map<string, unknown>>
  /** Per-cluster connection state */
  connectionState: Record<string, ConnectionState>
  /** Clusters that have received at least one snapshot — used to distinguish
   *  "connected but waiting for data" from "connected and data is empty" */
  snapshotsReady: Set<string>
  /** Monotonic counter incremented every 5s — forces relative time labels to re-render
   *  even when no SSE events arrive. Without this, "3s ago" freezes until the next K8s event. */
  tick: number

  /** Replace entire resource set for a (clusterId, resourceType) key (used by snapshot event) */
  setResources: (clusterId: string, type: ResourceType, items: unknown[]) => void
  /** Apply ADDED/MODIFIED/DELETED via O(1) Map operations */
  applyEvent: (clusterId: string, event: WatchEvent) => void
  /** Apply multiple events in a single state update (batch flush from 1s buffer) */
  applyEvents: (clusterId: string, events: WatchEvent[]) => void
  /** Update connection state for a cluster */
  setConnectionState: (clusterId: string, state: ConnectionState) => void
  /** Remove all data for a cluster and set its connection state to 'disconnected' */
  clearCluster: (clusterId: string) => void
  /** Increment tick counter — called by useResourceTick() interval */
  incrementTick: () => void
}

export const useResourceStore = create<ResourceStoreState>()((set) => ({
  resources: new Map(),
  connectionState: {},
  snapshotsReady: new Set(),
  tick: 0,

  setResources: (clusterId, type, items) =>
    set((state) => {
      const key = `${clusterId}:${type}`
      const innerMap = new Map<string, unknown>()
      for (const item of items) {
        const obj = item as { name: string; namespace?: string | null }
        innerMap.set(resourceKey(obj), item)
      }
      const next = new Map(state.resources)
      next.set(key, innerMap)
      // Mark cluster:type as having received snapshots
      const readyKey = `${clusterId}:${type}`
      if (!state.snapshotsReady.has(readyKey)) {
        const ready = new Set(state.snapshotsReady)
        ready.add(readyKey)
        return { resources: next, snapshotsReady: ready }
      }
      return { resources: next }
    }),

  applyEvent: (clusterId, event) =>
    set((state) => {
      const key = `${clusterId}:${event.resourceType}`
      const current = state.resources.get(key)
      if (!current) return state

      const obj = event.object as { name: string; namespace?: string | null }
      const rk = resourceKey(obj)
      const updated = new Map(current) // clone inner Map for Zustand detection

      switch (event.type) {
        case 'ADDED':
        case 'MODIFIED':
          updated.set(rk, event.object)
          break
        case 'DELETED':
          updated.delete(rk)
          break
      }

      const next = new Map(state.resources)
      next.set(key, updated)
      return { resources: next }
    }),

  applyEvents: (clusterId, events) =>
    set((state) => {
      const next = new Map(state.resources)

      for (const event of events) {
        const key = `${clusterId}:${event.resourceType}`
        let inner = next.get(key)
        if (!inner) continue
        // Clone inner map only once per resource type per batch
        if (inner === state.resources.get(key)) {
          inner = new Map(inner)
          next.set(key, inner)
        }

        const obj = event.object as { name: string; namespace?: string | null }
        const rk = resourceKey(obj)

        switch (event.type) {
          case 'ADDED':
          case 'MODIFIED':
            inner.set(rk, event.object)
            break
          case 'DELETED':
            inner.delete(rk)
            break
        }
      }

      return { resources: next }
    }),

  setConnectionState: (clusterId, connState) =>
    set((state) => ({
      connectionState: { ...state.connectionState, [clusterId]: connState },
    })),

  incrementTick: () => set((state) => ({ tick: state.tick + 1 })),

  clearCluster: (clusterId) =>
    set((state) => {
      const next = new Map(state.resources)
      const ready = new Set(state.snapshotsReady)
      const prefix = `${clusterId}:`
      for (const key of state.resources.keys()) {
        if (key.startsWith(prefix)) next.delete(key)
      }
      for (const key of state.snapshotsReady) {
        if (key.startsWith(prefix)) ready.delete(key)
      }
      return {
        resources: next,
        snapshotsReady: ready,
        connectionState: { ...state.connectionState, [clusterId]: 'disconnected' as const },
      }
    }),
}))
