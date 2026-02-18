import { describe, expect, it, vi, beforeEach } from 'vitest'

const serviceMocks = {
  deleteUserKey: vi.fn(),
  testStoredConnection: vi.fn(),
}

vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  },
}))

vi.mock('../services/ai-key-settings-service.js', () => ({
  AiKeySettingsService: vi.fn().mockImplementation(function AiKeySettingsServiceMock() {
    return serviceMocks
  }),
}))

import { aiRouter } from '../routers/ai.js'
import type { Context } from '../trpc.js'

function createCaller(user: Context['user'] = { id: 'user-1', email: 'u@v.test', role: 'user' } as any) {
  return aiRouter.createCaller({
    db: {} as any,
    user,
    session: { userId: 'user-1', expiresAt: new Date(Date.now() + 60_000) } as any,
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as any,
  })
}

describe('ai router key endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes key for current user provider only', async () => {
    serviceMocks.deleteUserKey.mockResolvedValue({ deleted: true })

    const caller = createCaller()
    const result = await caller.keys.delete({ provider: 'openai' })

    expect(serviceMocks.deleteUserKey).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'openai',
    })
    expect(result).toEqual({ deleted: true, provider: 'openai' })
  })

  it('tests stored connection using current user id', async () => {
    serviceMocks.testStoredConnection.mockResolvedValue({
      ok: true,
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-latest',
    })

    const caller = createCaller()
    const result = await caller.keys.testStoredConnection({ provider: 'anthropic' })

    expect(serviceMocks.testStoredConnection).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'anthropic',
    })
    expect(result).toEqual({
      success: true,
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-latest',
      error: undefined,
    })
  })
})
