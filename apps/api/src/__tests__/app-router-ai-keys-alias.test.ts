import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  },
}))

vi.mock('../services/ai-key-crypto.js', () => ({
  encryptApiKey: vi.fn(() => 'encrypted-key-data'),
  decryptApiKey: vi.fn(() => 'sk-live-1234567890'),
  maskApiKey: vi.fn(() => 'sk-****-test'),
}))

vi.mock('../lib/audit.js', () => ({
  logAudit: vi.fn(),
}))

import { appRouter } from '../routers/index.js'
import type { Context } from '../trpc.js'

function createCaller(
  user: Context['user'] = { id: 'user-1', email: 'u@v.test', role: 'user' } as any,
) {
  const mockDb = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }

  return appRouter.createCaller({
    db: mockDb as unknown as Context['db'],
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
    const caller = createCaller()
    const result = await caller.aiKeys.save({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-live-1234567890',
    })

    expect(result.key).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini',
      maskedKey: 'sk-****-test',
    })
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4o-mini')
  })

  it('exposes aiKeys.testConnection mutation with safe contract', async () => {
    const caller = createCaller()

    // testConnection throws TRPCError when no key stored; verify using 'claude' (internal name)
    await expect(
      caller.aiKeys.testConnection({ provider: 'claude' }),
    ).rejects.toThrow()
  })
})
