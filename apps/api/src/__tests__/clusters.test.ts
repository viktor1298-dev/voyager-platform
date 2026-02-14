import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('../lib/auth', () => ({
  auth: {
    api: { getSession: vi.fn().mockResolvedValue(null) },
    handler: vi.fn(),
  },
}))

import { clustersRouter } from '../routers/clusters'
import { type Context, router } from '../trpc'

const appRouter = router({ clusters: clustersRouter })

function createCaller(user: Context['user'] = null) {
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        // Return a thenable that also has groupBy for node counts query
        const result = Promise.resolve([{ id: '1', name: 'test', provider: 'minikube' }])
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
    res: { header: vi.fn() } as any,
  })
}

describe('clusters.list', () => {
  it('returns clusters with node counts', async () => {
    const caller = createCaller({ id: 'u1', email: 'a@b.com', name: 'Admin', role: 'admin' })
    const result = await caller.clusters.list()
    expect(result).toEqual([{ id: '1', name: 'test', provider: 'minikube', nodeCount: 2 }])
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
      caller.clusters.create({ name: 'test', provider: 'aws', endpoint: 'https://example.com' }),
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
