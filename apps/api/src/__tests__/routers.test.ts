import { describe, it, expect, vi } from 'vitest'

// Mock @voyager/db to avoid real DB connection
vi.mock('@voyager/db', () => ({
  db: {},
  Database: {},
}))

import { signToken, type UserPayload } from '../lib/auth'
import { authRouter } from '../routers/auth'
import { router, type Context } from '../trpc'

const appRouter = router({ auth: authRouter })

function createTestCaller(user: UserPayload | null = null) {
  return appRouter.createCaller({
    db: {} as any,
    user,
    res: { header: vi.fn() } as any,
  })
}

describe('auth router - login', () => {
  it('login with correct credentials returns token', async () => {
    const caller = createTestCaller()
    const result = await caller.auth.login({
      email: 'admin@voyager.local',
      password: 'test-pass',
    })
    expect(result.token).toBeDefined()
    expect(typeof result.token).toBe('string')
    expect(result.user.email).toBe('admin@voyager.local')
    expect(result.user.role).toBe('admin')
  })

  it('login with wrong password throws UNAUTHORIZED', async () => {
    const caller = createTestCaller()
    await expect(
      caller.auth.login({ email: 'admin@voyager.local', password: 'wrong-pass' })
    ).rejects.toThrow('Invalid credentials')
  })

  it('login with wrong email throws UNAUTHORIZED', async () => {
    const caller = createTestCaller()
    await expect(
      caller.auth.login({ email: 'wrong@voyager.local', password: 'test-pass' })
    ).rejects.toThrow('Invalid credentials')
  })
})

describe('auth router - me', () => {
  it('me with valid token returns user', async () => {
    const user: UserPayload = { id: 'admin-001', email: 'admin@voyager.local', role: 'admin' }
    const caller = createTestCaller(user)
    const result = await caller.auth.me()
    expect(result.email).toBe('admin@voyager.local')
    expect(result.role).toBe('admin')
  })

  it('me without token throws UNAUTHORIZED', async () => {
    const caller = createTestCaller(null)
    await expect(caller.auth.me()).rejects.toThrow('Authentication required')
  })
})
