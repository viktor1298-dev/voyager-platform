import { describe, it, expect, beforeEach } from 'vitest'
import { useResourceStore } from '../resource-store'

describe('resource-store', () => {
  beforeEach(() => {
    useResourceStore.setState({ resources: new Map(), connectionState: {} })
  })

  describe('setResources', () => {
    it('replaces entire array for a (clusterId, resourceType) key', () => {
      const items = [
        { name: 'pod-1', namespace: 'default' },
        { name: 'pod-2', namespace: 'kube-system' },
      ]

      useResourceStore.getState().setResources('cluster-1', 'pods', items)

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(stored).toEqual(items)

      // Replace with new array
      const newItems = [{ name: 'pod-3', namespace: 'default' }]
      useResourceStore.getState().setResources('cluster-1', 'pods', newItems)

      const updated = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(updated).toEqual(newItems)
    })
  })

  describe('applyEvent', () => {
    it('ADDED with new item appends to array', () => {
      const existing = [{ name: 'pod-1', namespace: 'default' }]
      useResourceStore.getState().setResources('cluster-1', 'pods', existing)

      useResourceStore.getState().applyEvent('cluster-1', {
        type: 'ADDED',
        resourceType: 'pods',
        object: { name: 'pod-2', namespace: 'default' },
      })

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(stored).toHaveLength(2)
      expect(stored).toEqual([
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

      const stored = useResourceStore.getState().resources.get('cluster-1:pods') as Array<{
        name: string
        status: string
      }>
      expect(stored).toHaveLength(1)
      expect(stored[0].status).toBe('Running')
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

      const stored = useResourceStore.getState().resources.get('cluster-1:pods') as Array<{
        name: string
        cpu: string
      }>
      expect(stored).toHaveLength(2)
      expect(stored[0].cpu).toBe('500m')
      expect(stored[1].cpu).toBe('200m')
    })

    it('MODIFIED with non-existent item leaves array unchanged', () => {
      const existing = [{ name: 'pod-1', namespace: 'default' }]
      useResourceStore.getState().setResources('cluster-1', 'pods', existing)

      useResourceStore.getState().applyEvent('cluster-1', {
        type: 'MODIFIED',
        resourceType: 'pods',
        object: { name: 'pod-999', namespace: 'default' },
      })

      const stored = useResourceStore.getState().resources.get('cluster-1:pods')
      expect(stored).toHaveLength(1)
      expect(stored).toEqual([{ name: 'pod-1', namespace: 'default' }])
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
      expect(stored).toHaveLength(1)
      expect(stored).toEqual([{ name: 'pod-2', namespace: 'kube-system' }])
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
      expect(state.resources.get('cluster-2:pods')).toEqual([{ name: 'p2' }])
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
      expect(c1Pods).toEqual([{ name: 'p1' }])

      // Selecting cluster-1:services returns only services for cluster-1
      const c1Svc = state.resources.get('cluster-1:services')
      expect(c1Svc).toEqual([{ name: 's1' }])

      // Selecting cluster-2:pods returns only pods for cluster-2
      const c2Pods = state.resources.get('cluster-2:pods')
      expect(c2Pods).toEqual([{ name: 'p2' }])

      // Selecting non-existent key returns undefined
      const missing = state.resources.get('cluster-2:services')
      expect(missing).toBeUndefined()
    })
  })
})
