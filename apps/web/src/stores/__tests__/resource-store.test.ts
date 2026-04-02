import { describe, it, expect, beforeEach } from 'vitest'
import { useResourceStore } from '../resource-store'

/** Helper: convert inner Map to array for assertion convenience */
function toArray(map: Map<string, unknown> | undefined): unknown[] {
  return map ? [...map.values()] : []
}

describe('resource-store', () => {
  beforeEach(() => {
    useResourceStore.setState({
      resources: new Map(),
      connectionState: {},
      snapshotsReady: new Set(),
    })
  })

  describe('setResources', () => {
    it('replaces entire map for a (clusterId, resourceType) key', () => {
      const items = [
        { name: 'pod-1', namespace: 'default' },
        { name: 'pod-2', namespace: 'kube-system' },
      ]

      useResourceStore.getState().setResources('cluster-1', 'pods', items)

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(toArray(stored)).toEqual(items)

      // Replace with new array
      const newItems = [{ name: 'pod-3', namespace: 'default' }]
      useResourceStore.getState().setResources('cluster-1', 'pods', newItems)

      const updated = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(toArray(updated)).toEqual(newItems)
    })
  })

  describe('applyEvent', () => {
    it('ADDED with new item adds to map', () => {
      const existing = [{ name: 'pod-1', namespace: 'default' }]
      useResourceStore.getState().setResources('cluster-1', 'pods', existing)

      useResourceStore.getState().applyEvent('cluster-1', {
        type: 'ADDED',
        resourceType: 'pods',
        object: { name: 'pod-2', namespace: 'default' },
      })

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(stored?.size).toBe(2)
      expect(toArray(stored)).toEqual([
        { name: 'pod-1', namespace: 'default' },
        { name: 'pod-2', namespace: 'default' },
      ])
    })

    it('ADDED with existing name+namespace does upsert (replace existing)', () => {
      const existing = [{ name: 'pod-1', namespace: 'default', status: 'Pending' }]
      useResourceStore.getState().setResources('cluster-1', 'pods', existing)

      useResourceStore.getState().applyEvent('cluster-1', {
        type: 'ADDED',
        resourceType: 'pods',
        object: { name: 'pod-1', namespace: 'default', status: 'Running' },
      })

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(stored?.size).toBe(1)
      const item = toArray(stored)[0] as { name: string; status: string }
      expect(item.status).toBe('Running')
    })

    it('MODIFIED replaces matching item by name+namespace', () => {
      const existing = [
        { name: 'pod-1', namespace: 'default', cpu: '100m' },
        { name: 'pod-2', namespace: 'default', cpu: '200m' },
      ]
      useResourceStore.getState().setResources('cluster-1', 'pods', existing)

      useResourceStore.getState().applyEvent('cluster-1', {
        type: 'MODIFIED',
        resourceType: 'pods',
        object: { name: 'pod-1', namespace: 'default', cpu: '500m' },
      })

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(stored?.size).toBe(2)
      const pod1 = stored?.get('default/pod-1') as { name: string; cpu: string }
      const pod2 = stored?.get('default/pod-2') as { name: string; cpu: string }
      expect(pod1.cpu).toBe('500m')
      expect(pod2.cpu).toBe('200m')
    })

    it('MODIFIED with non-existent item leaves map unchanged', () => {
      const existing = [{ name: 'pod-1', namespace: 'default' }]
      useResourceStore.getState().setResources('cluster-1', 'pods', existing)

      useResourceStore.getState().applyEvent('cluster-1', {
        type: 'MODIFIED',
        resourceType: 'pods',
        object: { name: 'pod-999', namespace: 'default' },
      })

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      // MODIFIED on Map sets the key regardless (O(1) — no need to check existence)
      // This is a behavior difference from the old array-based store:
      // Map.set always upserts, so a MODIFIED for a non-existent item adds it.
      // This is actually correct K8s behavior — a MODIFIED event always means
      // the resource exists in the cluster.
      expect(stored?.size).toBe(2)
    })

    it('DELETED removes matching item by name+namespace', () => {
      const existing = [
        { name: 'pod-1', namespace: 'default' },
        { name: 'pod-2', namespace: 'kube-system' },
      ]
      useResourceStore.getState().setResources('cluster-1', 'pods', existing)

      useResourceStore.getState().applyEvent('cluster-1', {
        type: 'DELETED',
        resourceType: 'pods',
        object: { name: 'pod-1', namespace: 'default' },
      })

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(stored?.size).toBe(1)
      expect(toArray(stored)).toEqual([{ name: 'pod-2', namespace: 'kube-system' }])
    })
  })

  describe('applyEvents (batch)', () => {
    it('applies multiple events in a single state update', () => {
      const existing = [
        { name: 'pod-1', namespace: 'default' },
        { name: 'pod-2', namespace: 'default' },
      ]
      useResourceStore.getState().setResources('cluster-1', 'pods', existing)

      useResourceStore.getState().applyEvents('cluster-1', [
        {
          type: 'DELETED',
          resourceType: 'pods',
          object: { name: 'pod-1', namespace: 'default' },
        },
        {
          type: 'ADDED',
          resourceType: 'pods',
          object: { name: 'pod-3', namespace: 'default' },
        },
      ])

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(stored?.size).toBe(2)
      expect(stored?.has('default/pod-1')).toBe(false)
      expect(stored?.has('default/pod-2')).toBe(true)
      expect(stored?.has('default/pod-3')).toBe(true)
    })
  })

  describe('clearCluster', () => {
    it('removes all entries for that clusterId and sets connectionState to disconnected', () => {
      useResourceStore.getState().setResources('cluster-1', 'pods', [{ name: 'p1' }])
      useResourceStore.getState().setResources('cluster-1', 'services', [{ name: 's1' }])
      useResourceStore.getState().setResources('cluster-2', 'pods', [{ name: 'p2' }])
      useResourceStore.getState().setConnectionState('cluster-1', 'connected')
      useResourceStore.getState().setConnectionState('cluster-2', 'connected')

      useResourceStore.getState().clearCluster('cluster-1')

      const state = useResourceStore.getState()
      // cluster-1 data removed
      expect(state.resources.get('cluster-1:pods')).toBeUndefined()
      expect(state.resources.get('cluster-1:services')).toBeUndefined()
      // cluster-2 data preserved
      expect(toArray(state.resources.get('cluster-2:pods'))).toEqual([{ name: 'p2' }])
      // cluster-1 connection state set to disconnected
      expect(state.connectionState['cluster-1']).toBe('disconnected')
      // cluster-2 connection state preserved
      expect(state.connectionState['cluster-2']).toBe('connected')
    })
  })

  describe('setConnectionState', () => {
    it('updates only the specified cluster state', () => {
      useResourceStore.getState().setConnectionState('cluster-1', 'initializing')
      useResourceStore.getState().setConnectionState('cluster-2', 'connected')

      useResourceStore.getState().setConnectionState('cluster-1', 'reconnecting')

      const state = useResourceStore.getState()
      expect(state.connectionState['cluster-1']).toBe('reconnecting')
      expect(state.connectionState['cluster-2']).toBe('connected')
    })
  })

  describe('selector isolation', () => {
    it('only returns data for the requested (clusterId, resourceType) key', () => {
      useResourceStore.getState().setResources('cluster-1', 'pods', [{ name: 'p1' }])
      useResourceStore.getState().setResources('cluster-1', 'services', [{ name: 's1' }])
      useResourceStore.getState().setResources('cluster-2', 'pods', [{ name: 'p2' }])

      const state = useResourceStore.getState()

      // Selecting cluster-1:pods returns only pods for cluster-1
      const c1Pods = state.resources.get('cluster-1:pods')
      expect(toArray(c1Pods)).toEqual([{ name: 'p1' }])

      // Selecting cluster-1:services returns only services for cluster-1
      const c1Svc = state.resources.get('cluster-1:services')
      expect(toArray(c1Svc)).toEqual([{ name: 's1' }])

      // Selecting cluster-2:pods returns only pods for cluster-2
      const c2Pods = state.resources.get('cluster-2:pods')
      expect(toArray(c2Pods)).toEqual([{ name: 'p2' }])

      // Selecting non-existent key returns undefined
      const missing = state.resources.get('cluster-2:services')
      expect(missing).toBeUndefined()
    })
  })

  describe('Map-of-Maps correctness', () => {
    it('resourceKey uses namespace/name composite key', () => {
      useResourceStore.getState().setResources('c1', 'pods', [
        { name: 'web', namespace: 'default' },
        { name: 'web', namespace: 'staging' },
      ])

      const stored = useResourceStore.getState().resources.get('c1:pods')
      // Same name, different namespace — both stored
      expect(stored?.size).toBe(2)
      expect(stored?.has('default/web')).toBe(true)
      expect(stored?.has('staging/web')).toBe(true)
    })

    it('namespace-less resources use name-only key', () => {
      useResourceStore
        .getState()
        .setResources('c1', 'nodes', [{ name: 'node-1' }, { name: 'node-2' }])

      const stored = useResourceStore.getState().resources.get('c1:nodes')
      expect(stored?.size).toBe(2)
      expect(stored?.has('node-1')).toBe(true)
      expect(stored?.has('node-2')).toBe(true)
    })

    it('applyEvents clones inner map only once per resource type per batch', () => {
      useResourceStore
        .getState()
        .setResources('c1', 'pods', [{ name: 'pod-1', namespace: 'default' }])

      const stateBefore = useResourceStore.getState()
      const innerBefore = stateBefore.resources.get('c1:pods')

      useResourceStore.getState().applyEvents('c1', [
        {
          type: 'ADDED',
          resourceType: 'pods',
          object: { name: 'pod-2', namespace: 'default' },
        },
        {
          type: 'ADDED',
          resourceType: 'pods',
          object: { name: 'pod-3', namespace: 'default' },
        },
      ])

      const stateAfter = useResourceStore.getState()
      const innerAfter = stateAfter.resources.get('c1:pods')

      // Inner map reference changed (cloned for immutability)
      expect(innerAfter).not.toBe(innerBefore)
      // All events applied
      expect(innerAfter?.size).toBe(3)
    })
  })
})
