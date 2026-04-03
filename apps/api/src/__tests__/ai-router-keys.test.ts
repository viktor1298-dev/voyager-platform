import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: () => mockLog, silent: vi.fn() } as any

function createCaller(
  user: Context['user'] = { id: 'user-1', email: 'u@v.test', role: 'user' } as any,
) {
  return aiRouter.createCaller({
    db: {} as any,
    log: mockLog,
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

  it('returns deleted=false when provider key does not exist', async () => {
    serviceMocks.deleteUserKey.mockResolvedValue({ deleted: false })

    const caller = createCaller()
    const result = await caller.keys.delete({ provider: 'anthropic' })

    expect(serviceMocks.deleteUserKey).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'anthropic',
    })
    expect(result).toEqual({ deleted: false, provider: 'anthropic' })
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

  it('returns success=false and error when no stored key exists', async () => {
    serviceMocks.testStoredConnection.mockResolvedValue({
      ok: false,
      provider: 'openai',
      error: 'No saved key found for this provider',
    })

    const caller = createCaller()
    const result = await caller.keys.testStoredConnection({ provider: 'openai' })

    expect(serviceMocks.testStoredConnection).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'openai',
    })
    expect(result).toEqual({
      success: false,
      provider: 'openai',
      model: undefined,
      error: 'No saved key found for this provider',
    })
  })

  it('preserves sanitized failure message contract from service', async () => {
    serviceMocks.testStoredConnection.mockResolvedValue({
      ok: false,
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-latest',
      error: 'Invalid provider credentials. Please verify the API key and model.',
    })

    const caller = createCaller()
    const result = await caller.keys.testStoredConnection({ provider: 'anthropic' })

    expect(result).toEqual({
      success: false,
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-latest',
      error: 'Invalid provider credentials. Please verify the API key and model.',
    })
    expect(result.error).not.toContain('sk-')
  })
})
