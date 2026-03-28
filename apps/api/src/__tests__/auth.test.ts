import { describe, expect, it, vi } from 'vitest'

// Mock better-auth to avoid DB dependency in unit tests
vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  },
}))

vi.mock('@voyager/db', () => ({
  db: {},
  Database: {},
}))

import { authRouter } from '../routers/auth.js'
import { type Context, router } from '../trpc.js'

const appRouter = router({ auth: authRouter })

function createTestCaller(user: Context['user'] = null, session: Context['session'] = null) {
  return appRouter.createCaller({
    db: {} as any,
    user,
    session,
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as any,
  })
}

describe('auth router - me', () => {
  it('me with valid session returns user', async () => {
    const user = { id: 'admin-001', email: 'admin@voyager.local', name: 'Admin', role: 'admin' }
    const session = { userId: 'admin-001', expiresAt: new Date(Date.now() + 86400000) }
    const caller = createTestCaller(user, session)
    const result = await caller.auth.me()
    expect(result.email).toBe('admin@voyager.local')
    expect(result.role).toBe('admin')
  })

  it('me without session throws UNAUTHORIZED', async () => {
    const caller = createTestCaller(null, null)
    await expect(caller.auth.me()).rejects.toThrow('Authentication required')
  })
})
