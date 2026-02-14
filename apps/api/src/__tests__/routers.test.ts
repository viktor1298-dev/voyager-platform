import { describe, it, expect, vi } from 'vitest'

// Mock @voyager/db and better-auth
vi.mock('@voyager/db', () => ({
  db: {},
  Database: {},
}))

vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  },
}))

import { authRouter } from '../routers/auth'
import { router, type Context } from '../trpc'

const appRouter = router({ auth: authRouter })

function createTestCaller(user: Context['user'] = null, session: Context['session'] = null) {
  return appRouter.createCaller({
    db: {} as any,
    user,
    session,
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
