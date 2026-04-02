import { create } from 'zustand'
import type { ResourceType, WatchEvent } from '@voyager/types'

export type ConnectionState = 'initializing' | 'connected' | 'reconnecting' | 'disconnected'

interface ResourceStoreState {
  /** Keyed by `${clusterId}:${resourceType}` */
  resources: Map<string, unknown[]>
  /** Per-cluster connection state */
  connectionState: Record<string, ConnectionState>
  /** Clusters that have received at least one snapshot — used to distinguish
   *  "connected but waiting for data" from "connected and data is empty" */
  snapshotsReady: Set<string>
  /** Monotonic counter incremented every 5s — forces relative time labels to re-render
   *  even when no SSE events arrive. Without this, "3s ago" freezes until the next K8s event. */
  tick: number

  /** Replace entire array for a (clusterId, resourceType) key (used by snapshot event) */
  setResources: (clusterId: string, type: ResourceType, items: unknown[]) => void
  /** Apply ADDED/MODIFIED/DELETED to the array for event.resourceType */
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
      const next = new Map(state.resources)
      next.set(key, items)
      // Mark cluster as having received snapshots
      if (!state.snapshotsReady.has(clusterId)) {
        const ready = new Set(state.snapshotsReady)
        ready.add(clusterId)
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
      let updated: unknown[]

      switch (event.type) {
        case 'ADDED': {
          const idx = current.findIndex((item) => {
            const i = item as { name: string; namespace?: string | null }
            return i.name === obj.name && i.namespace === obj.namespace
          })
          if (idx >= 0) {
            updated = [...current]
            updated[idx] = event.object
          } else {
            updated = [...current, event.object]
          }
          break
        }
        case 'MODIFIED': {
          updated = current.map((item) => {
            const i = item as { name: string; namespace?: string | null }
            return i.name === obj.name && i.namespace === obj.namespace ? event.object : item
          })
          break
        }
        case 'DELETED': {
          updated = current.filter((item) => {
            const i = item as { name: string; namespace?: string | null }
            return !(i.name === obj.name && i.namespace === obj.namespace)
          })
          break
        }
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
        const current = next.get(key)
        if (!current) continue

        const obj = event.object as { name: string; namespace?: string | null }

        switch (event.type) {
          case 'ADDED': {
            const idx = current.findIndex((item) => {
              const i = item as { name: string; namespace?: string | null }
              return i.name === obj.name && i.namespace === obj.namespace
            })
            if (idx >= 0) {
              const updated = [...current]
              updated[idx] = event.object
              next.set(key, updated)
            } else {
              next.set(key, [...current, event.object])
            }
            break
          }
          case 'MODIFIED': {
            next.set(
              key,
              current.map((item) => {
                const i = item as { name: string; namespace?: string | null }
                return i.name === obj.name && i.namespace === obj.namespace ? event.object : item
              }),
            )
            break
          }
          case 'DELETED': {
            next.set(
              key,
              current.filter((item) => {
                const i = item as { name: string; namespace?: string | null }
                return !(i.name === obj.name && i.namespace === obj.namespace)
              }),
            )
            break
          }
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
      const prefix = `${clusterId}:`
      for (const key of state.resources.keys()) {
        if (key.startsWith(prefix)) {
          next.delete(key)
        }
      }
      const ready = new Set(state.snapshotsReady)
      ready.delete(clusterId)
      return {
        resources: next,
        snapshotsReady: ready,
        connectionState: { ...state.connectionState, [clusterId]: 'disconnected' as const },
      }
    }),
}))
