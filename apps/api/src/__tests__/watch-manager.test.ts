import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────

// Mock cluster-client-pool
vi.mock('../lib/cluster-client-pool.js', () => ({
  clusterClientPool: {
    getClient: vi.fn(),
  },
}))

// Mock event-emitter
vi.mock('../lib/event-emitter.js', () => ({
  voyagerEmitter: {
    emitWatchEvent: vi.fn(),
    emitWatchStatus: vi.fn(),
    emitResourceChange: vi.fn(),
  },
}))

// Create mock informer factory
function createMockInformer() {
  const handlers = new Map<string, Array<(obj: unknown) => void>>()
  const store = new Map<string, unknown>()

  const informer = {
    on: vi.fn((event: string, handler: (obj: unknown) => void) => {
      const existing = handlers.get(event) ?? []
      existing.push(handler)
      handlers.set(event, existing)
      return informer
    }),
    off: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    list: vi.fn(() => [...store.values()]),
    get: vi.fn((name: string, namespace?: string) => {
      const key = namespace ? `${namespace}/${name}` : name
      return store.get(key)
    }),
    // Test helpers
    _trigger: (event: string, obj: unknown) => {
      const eventHandlers = handlers.get(event) ?? []
      for (const h of eventHandlers) h(obj)
    },
    _addToStore: (name: string, obj: unknown, namespace?: string) => {
      const key = namespace ? `${namespace}/${name}` : name
      store.set(key, obj)
    },
  }
  return informer
}

// Mock @kubernetes/client-node
const mockMakeInformer = vi.fn()
vi.mock('@kubernetes/client-node', () => ({
  makeInformer: (...args: unknown[]) => mockMakeInformer(...args),
  KubeConfig: vi.fn(),
  CoreV1Api: vi.fn(),
  AppsV1Api: vi.fn(),
  BatchV1Api: vi.fn(),
  AutoscalingV2Api: vi.fn(),
  NetworkingV1Api: vi.fn(),
}))

// Mock resource-mappers — return a predictable shape for all mappers
vi.mock('../lib/resource-mappers.js', () => ({
  mapPod: vi.fn((obj: unknown) => ({
    kind: 'pod',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapDeployment: vi.fn((obj: unknown, clusterId: string) => ({
    kind: 'deployment',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
    clusterId,
  })),
  mapService: vi.fn((obj: unknown) => ({
    kind: 'service',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapNode: vi.fn((obj: unknown) => ({
    kind: 'node',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapConfigMap: vi.fn((obj: unknown) => ({
    kind: 'configmap',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapSecret: vi.fn((obj: unknown) => ({
    kind: 'secret',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapPVC: vi.fn((obj: unknown) => ({
    kind: 'pvc',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapNamespace: vi.fn((obj: unknown) => ({
    kind: 'namespace',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapEvent: vi.fn((obj: unknown) => ({
    kind: 'event',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapIngress: vi.fn((obj: unknown) => ({
    kind: 'ingress',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapStatefulSet: vi.fn((obj: unknown) => ({
    kind: 'statefulset',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapDaemonSet: vi.fn((obj: unknown) => ({
    kind: 'daemonset',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapJob: vi.fn((obj: unknown) => ({
    kind: 'job',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapCronJob: vi.fn((obj: unknown) => ({
    kind: 'cronjob',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapHPA: vi.fn((obj: unknown) => ({
    kind: 'hpa',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapNetworkPolicy: vi.fn((obj: unknown) => ({
    kind: 'networkpolicy',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
  mapResourceQuota: vi.fn((obj: unknown) => ({
    kind: 'resourcequota',
    name: (obj as { metadata?: { name?: string } }).metadata?.name ?? '',
  })),
}))

// ── Import after mocks ────────────────────────────────────────

import { WatchManager } from '../lib/watch-manager.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'

// ── Tests ─────────────────────────────────────────────────────

describe('WatchManager', () => {
  let manager: WatchManager
  const mockKubeConfig = {
    makeApiClient: vi.fn(() => ({})),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new WatchManager()
    ;(clusterClientPool.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockKubeConfig)
    mockMakeInformer.mockImplementation(() => createMockInformer())
  })

  afterEach(() => {
    manager.stopAll()
  })

  it('subscribe(clusterId) starts informers for all 17 resource types', async () => {
    await manager.subscribe('cluster-1')

    // makeInformer should be called 17 times (one per resource type)
    expect(mockMakeInformer).toHaveBeenCalledTimes(17)
    expect(manager.isWatching('cluster-1')).toBe(true)
  })

  it('subscribe(clusterId) called twice increments subscriberCount to 2', async () => {
    await manager.subscribe('cluster-1')
    await manager.subscribe('cluster-1')

    // Still watching, but makeInformer only called 17 times (first subscribe)
    expect(mockMakeInformer).toHaveBeenCalledTimes(17)
    expect(manager.isWatching('cluster-1')).toBe(true)
  })

  it('unsubscribe(clusterId) decrements subscriberCount; at 0 stops all informers', async () => {
    await manager.subscribe('cluster-1')
    await manager.subscribe('cluster-1')

    // First unsubscribe — still watching (count goes from 2 to 1)
    manager.unsubscribe('cluster-1')
    expect(manager.isWatching('cluster-1')).toBe(true)

    // Second unsubscribe — stops watching (count goes from 1 to 0)
    manager.unsubscribe('cluster-1')
    expect(manager.isWatching('cluster-1')).toBe(false)
  })

  it('getResources(clusterId, "pods") returns null before informer ready set is populated', async () => {
    const mockInformer = createMockInformer()
    mockInformer._addToStore(
      'pod-1',
      { metadata: { name: 'pod-1', namespace: 'default' } },
      'default',
    )
    mockInformer._addToStore(
      'pod-2',
      { metadata: { name: 'pod-2', namespace: 'kube-system' } },
      'kube-system',
    )

    let callCount = 0
    mockMakeInformer.mockImplementation(() => {
      callCount++
      // The first resource def is 'pods'
      if (callCount === 1) return mockInformer
      return createMockInformer()
    })

    await manager.subscribe('cluster-1')
    // getResources returns null until the informer's 'connect' event fires
    // (which populates the ready set). Mock informers don't emit 'connect'.
    const pods = manager.getResources('cluster-1', 'pods')
    expect(pods).toBeNull()
  })

  it('getResource(clusterId, "pods", name, namespace) returns informer.get() result', async () => {
    const mockInformer = createMockInformer()
    const podObj = { metadata: { name: 'my-pod', namespace: 'default' } }
    mockInformer._addToStore('my-pod', podObj, 'default')

    let callCount = 0
    mockMakeInformer.mockImplementation(() => {
      callCount++
      if (callCount === 1) return mockInformer
      return createMockInformer()
    })

    await manager.subscribe('cluster-1')
    const pod = manager.getResource('cluster-1', 'pods', 'my-pod', 'default')
    expect(pod).toEqual(podObj)
  })

  it('getResources for unknown clusterId returns null', () => {
    const result = manager.getResources('unknown-cluster', 'pods')
    expect(result).toBeNull()
  })

  it('isWatching(clusterId) returns true after subscribe, false after all unsubscribe', async () => {
    expect(manager.isWatching('cluster-1')).toBe(false)
    await manager.subscribe('cluster-1')
    expect(manager.isWatching('cluster-1')).toBe(true)
    manager.unsubscribe('cluster-1')
    expect(manager.isWatching('cluster-1')).toBe(false)
  })

  it('getActiveClusterIds() returns list of clusters with subscribers > 0', async () => {
    await manager.subscribe('cluster-1')
    await manager.subscribe('cluster-2')

    const active = manager.getActiveClusterIds()
    expect(active).toContain('cluster-1')
    expect(active).toContain('cluster-2')
    expect(active).toHaveLength(2)

    manager.unsubscribe('cluster-2')
    const active2 = manager.getActiveClusterIds()
    expect(active2).toContain('cluster-1')
    expect(active2).not.toContain('cluster-2')
  })

  it('stopAll() stops all informers for all clusters', async () => {
    await manager.subscribe('cluster-1')
    await manager.subscribe('cluster-2')

    manager.stopAll()
    expect(manager.isWatching('cluster-1')).toBe(false)
    expect(manager.isWatching('cluster-2')).toBe(false)
    expect(manager.getActiveClusterIds()).toEqual([])
  })
})
