import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockValidateClusterConnection } = vi.hoisted(() => ({
  mockValidateClusterConnection: vi.fn(),
}))

// Mock DB - vi.mock factory cannot reference external variables
vi.mock('@voyager/db', () => ({
  db: {},
  clusters: { id: 'id' },
  nodes: { clusterId: 'clusterId' },
  Database: {},
}))

vi.mock('../lib/k8s', () => ({
  getCoreV1Api: () => ({}),
  getAppsV1Api: () => ({}),
  getVersionApi: () => ({}),
}))

vi.mock('../lib/cache', () => ({
  cached: vi.fn((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidateK8sCache: vi.fn().mockResolvedValue(3),
}))

vi.mock('../lib/k8s-client-factory', () => ({
  validateClusterConnection: mockValidateClusterConnection,
}))

vi.mock('../lib/auth', () => ({
  auth: {
    api: { getSession: vi.fn().mockResolvedValue(null) },
    handler: vi.fn(),
  },
}))

import { clustersRouter } from '../routers/clusters.js'
import { type Context, router } from '../trpc.js'

const appRouter = router({ clusters: clustersRouter })

beforeEach(() => {
  vi.clearAllMocks()
})

function createCaller(user: Context['user'] = null) {
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        // Return a thenable that also has groupBy for node counts query
        const result = Promise.resolve([
          { id: '1', name: 'test', provider: 'minikube', environment: 'development' },
        ])
        ;(result as any).groupBy = vi.fn().mockResolvedValue([{ clusterId: '1', count: 2 }])
        ;(result as any).where = vi.fn().mockResolvedValue([])
        return result
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: '1', name: 'test' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: '1' }]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: '1' }]),
      }),
    }),
  }

  return appRouter.createCaller({
    db: mockDb as unknown as Context['db'],
    user,
    session: user ? { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } : null,
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as any,
  })
}

describe('clusters.list', () => {
  it('returns clusters with node counts', async () => {
    const caller = createCaller({ id: 'u1', email: 'a@b.com', name: 'Admin', role: 'admin' })
    const result = await caller.clusters.list()
    expect(result).toEqual([
      {
        id: '1',
        name: 'test',
        provider: 'minikube',
        environment: 'development',
        nodeCount: 2,
        hasCredentials: false,
      },
    ])
  })
})

describe('clusters.invalidateCache requires auth', () => {
  it('throws UNAUTHORIZED without user', async () => {
    const caller = createCaller(null)
    await expect(caller.clusters.invalidateCache()).rejects.toThrow('Authentication required')
  })

  it('works with authenticated user', async () => {
    const caller = createCaller({ id: 'u1', email: 'a@b.com', name: 'Admin', role: 'admin' })
    const result = await caller.clusters.invalidateCache()
    expect(result).toEqual({ invalidated: 3 })
  })
})

describe('clusters CUD routes require auth', () => {
  it('create throws UNAUTHORIZED without user', async () => {
    const caller = createCaller(null)
    await expect(
      caller.clusters.create({
        name: 'test',
        provider: 'kubeconfig',
        endpoint: 'https://example.com',
      }),
    ).rejects.toThrow('Authentication required')
  })

  it('update throws UNAUTHORIZED without user', async () => {
    const caller = createCaller(null)
    await expect(
      caller.clusters.update({ id: '00000000-0000-0000-0000-000000000000', status: 'healthy' }),
    ).rejects.toThrow('Authentication required')
  })

  it('delete throws UNAUTHORIZED without user', async () => {
    const caller = createCaller(null)
    await expect(
      caller.clusters.delete({ id: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow('Authentication required')
  })
})

describe('clusters.validateConnection', () => {
  const adminUser = { id: 'u1', email: 'a@b.com', name: 'Admin', role: 'admin' } as const

  it('returns success for valid connection', async () => {
    mockValidateClusterConnection.mockResolvedValue({
      reachable: true,
      message: 'Connection successful',
      context: 'ctx',
      version: '1.30',
    })

    const caller = createCaller(adminUser)
    const result = await caller.clusters.validateConnection({
      provider: 'kubeconfig',
      connectionConfig: {
        kubeconfig: 'apiVersion: v1\nclusters: []',
      },
    })

    expect(result).toEqual({
      success: true,
      message: 'Connection successful',
      context: 'ctx',
      version: '1.30',
    })
    expect(mockValidateClusterConnection).toHaveBeenCalledOnce()
  })

  it('fails on invalid provider config shape (Zod validation)', async () => {
    const caller = createCaller(adminUser)

    await expect(
      caller.clusters.validateConnection({
        provider: 'aws',
        connectionConfig: {
          kubeconfig: 'apiVersion: v1\nclusters: []',
        },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(mockValidateClusterConnection).not.toHaveBeenCalled()
  })

  it('requires authentication', async () => {
    const caller = createCaller(null)

    await expect(
      caller.clusters.validateConnection({
        provider: 'kubeconfig',
        connectionConfig: {
          kubeconfig: 'apiVersion: v1\nclusters: []',
        },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('maps connection refused errors to BAD_GATEWAY', async () => {
    mockValidateClusterConnection.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:6443'),
    )
    const caller = createCaller(adminUser)

    await expect(
      caller.clusters.validateConnection({
        provider: 'kubeconfig',
        connectionConfig: { kubeconfig: 'apiVersion: v1\nclusters: []' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_GATEWAY' })
  })

  it('maps auth errors to UNAUTHORIZED', async () => {
    mockValidateClusterConnection.mockRejectedValue(new Error('401 Unauthorized'))
    const caller = createCaller(adminUser)

    await expect(
      caller.clusters.validateConnection({
        provider: 'kubeconfig',
        connectionConfig: { kubeconfig: 'apiVersion: v1\nclusters: []' },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('maps timeout errors to GATEWAY_TIMEOUT', async () => {
    mockValidateClusterConnection.mockRejectedValue(
      new Error('Request ETIMEDOUT while connecting to API'),
    )
    const caller = createCaller(adminUser)

    await expect(
      caller.clusters.validateConnection({
        provider: 'kubeconfig',
        connectionConfig: { kubeconfig: 'apiVersion: v1\nclusters: []' },
      }),
    ).rejects.toMatchObject({ code: 'GATEWAY_TIMEOUT' })
  })

  it('maps unknown errors to INTERNAL_SERVER_ERROR', async () => {
    mockValidateClusterConnection.mockRejectedValue(new Error('Something odd happened'))
    const caller = createCaller(adminUser)

    await expect(
      caller.clusters.validateConnection({
        provider: 'kubeconfig',
        connectionConfig: { kubeconfig: 'apiVersion: v1\nclusters: []' },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })
})
