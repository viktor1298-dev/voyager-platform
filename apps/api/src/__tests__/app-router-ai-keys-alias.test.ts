import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = {
  testConnection: vi.fn(),
  upsertUserKey: vi.fn(),
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

import { appRouter } from '../routers/index.js'
import type { Context } from '../trpc.js'

function createCaller(
  user: Context['user'] = { id: 'user-1', email: 'u@v.test', role: 'user' } as any,
) {
  return appRouter.createCaller({
    db: {} as any,
    user,
    session: { userId: 'user-1', expiresAt: new Date(Date.now() + 60_000) } as any,
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as any,
  })
}

describe('app router aiKeys alias compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes aiKeys.save mutation as alias to ai.keys.save', async () => {
    serviceMocks.testConnection.mockResolvedValue({ ok: true, provider: 'openai', model: 'gpt-4o-mini' })
    serviceMocks.upsertUserKey.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4o-mini',
      maskedKey: 'sk-****-test',
      hasKey: true,
      updatedAt: new Date('2026-02-18T12:00:00.000Z'),
    })

    const caller = createCaller()
    const result = await caller.aiKeys.save({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-live-1234567890',
    })

    expect(serviceMocks.testConnection).toHaveBeenCalledTimes(1)
    expect(serviceMocks.upsertUserKey).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-live-1234567890',
    })
    expect(result.key).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini',
      maskedKey: 'sk-****-test',
      hasKey: true,
    })
  })

  it('exposes aiKeys.testConnection mutation with safe contract', async () => {
    serviceMocks.testConnection.mockResolvedValue({
      ok: false,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      error: 'Invalid provider credentials. Please verify the API key and model.',
    })

    const caller = createCaller()
    const result = await caller.aiKeys.testConnection({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      apiKey: 'sk-ant-very-secret',
    })

    expect(result).toEqual({
      success: false,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      error: 'Invalid provider credentials. Please verify the API key and model.',
    })
    expect(result.error).not.toContain('sk-')
  })
})
