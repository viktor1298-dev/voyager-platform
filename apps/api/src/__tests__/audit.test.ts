import { describe, expect, it, vi } from 'vitest'

// Build a deeply-chainable mock DB for drizzle queries
function chainMock(terminal: unknown = []) {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'then') return undefined // not a thenable
      return (...args: unknown[]) => new Proxy(() => terminal, handler)
    },
    apply(_target) {
      return new Proxy(() => terminal, handler)
    },
  }
  return new Proxy(() => terminal, handler)
}

function createMockDb() {
  const insertValues = vi.fn().mockResolvedValue(undefined)
  return {
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue(Object.assign(Promise.resolve([]), {
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          })),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    _insertValues: insertValues,
  }
}

vi.mock('@voyager/db', () => ({
  db: {},
  Database: {},
  auditLog: {
    id: 'id', userId: 'user_id', action: 'action', resource: 'resource',
    resourceId: 'resource_id', timestamp: 'timestamp', userEmail: 'user_email',
    details: 'details', ipAddress: 'ip_address',
  },
}))

vi.mock('../lib/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
}))

import { logAudit } from '../lib/audit.js'
import { auditRouter } from '../routers/audit.js'
import { type Context, router } from '../trpc.js'

describe('logAudit', () => {
  it('inserts audit record with correct values', async () => {
    const mockDb = createMockDb()
    const ctx = {
      db: mockDb as any,
      user: { id: 'u1', email: 'test@test.com' },
      ipAddress: '127.0.0.1',
    }

    await logAudit(ctx, 'cluster.create', 'cluster', 'c1', { name: 'test' })
    expect(mockDb.insert).toHaveBeenCalled()
    expect(mockDb._insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', action: 'cluster.create', resource: 'cluster', resourceId: 'c1' }),
    )
  })

  it('does not throw on db error', async () => {
    const ctx = {
      db: { insert: vi.fn().mockReturnValue({ values: vi.fn().mockRejectedValue(new Error('db down')) }) } as any,
      user: { id: 'u1', email: 'test@test.com' },
    }
    await expect(logAudit(ctx, 'test', 'test')).resolves.toBeUndefined()
  })
})

describe('audit router', () => {
  const appRouter = router({ audit: auditRouter })

  function createCaller(role: string) {
    const mockDb = createMockDb()
    return appRouter.createCaller({
      db: mockDb as any,
      user: { id: 'u1', email: 'a@a.com', name: 'Admin', role },
      session: { userId: 'u1', expiresAt: new Date(Date.now() + 86400000) },
      ipAddress: '127.0.0.1',
      res: { header: vi.fn() } as any,
    })
  }

  it('list requires admin', async () => {
    const caller = createCaller('viewer')
    await expect(caller.audit.list({})).rejects.toThrow('Admin access required')
  })

  it('list returns paginated results for admin', async () => {
    const caller = createCaller('admin')
    const result = await caller.audit.list({})
    expect(result).toHaveProperty('items')
    expect(result).toHaveProperty('page', 1)
  })

  it('getByResource returns results', async () => {
    const caller = createCaller('viewer')
    const result = await caller.audit.getByResource({ resourceId: 'r1' })
    expect(Array.isArray(result)).toBe(true)
  })
})
