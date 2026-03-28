import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  },
}))

vi.mock('../services/ai-provider.js', () => ({
  AiProviderClient: class {
    complete = vi.fn().mockResolvedValue({ content: 'OK' })
  },
}))

import { aiKeysRouter } from '../routers/ai-keys.js'
import { type Context, router } from '../trpc.js'

type KeyRecord = {
  userId: string
  provider: 'openai' | 'claude'
  encryptedKey: string
  model: string
  updatedAt: Date
}

function createMockDb() {
  const records: KeyRecord[] = []

  return {
    records,
    insert: () => ({
      values: (value: Omit<KeyRecord, 'updatedAt'>) => ({
        onConflictDoUpdate: async () => {
          const existing = records.find(
            (r) => r.userId === value.userId && r.provider === value.provider,
          )
          if (existing) {
            existing.encryptedKey = value.encryptedKey
            existing.model = value.model
            existing.updatedAt = new Date()
            return
          }

          records.push({ ...value, updatedAt: new Date() })
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => [...records],
          limit: async () => records.slice(0, 1),
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        records.splice(0, records.length)
      },
    }),
  }
}

function createTestCaller(db: unknown, user: Context['user']) {
  const appRouter = router({ aiKeys: aiKeysRouter })

  return appRouter.createCaller({
    db: db as never,
    user,
    session: { userId: user?.id ?? '', expiresAt: new Date(Date.now() + 60_000) },
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as never,
  })
}

describe('aiKeysRouter', () => {
  beforeEach(() => {
    process.env.AI_KEYS_ENCRYPTION_KEY = 'router-test-secret'
  })

  it('supports save/get/delete CRUD for authenticated user', async () => {
    const db = createMockDb()
    const caller = createTestCaller(db, {
      id: 'user-1',
      email: 'u1@test.local',
      name: 'User 1',
      role: 'member',
    })

    const saved = await caller.aiKeys.save({
      provider: 'openai',
      apiKey: 'sk-test-12345',
      model: 'gpt-4o-mini',
    })

    expect(saved.key.provider).toBe('openai')
    expect(saved.key.maskedKey.length).toBeGreaterThan(0)
    expect(saved.provider).toBe(saved.key.provider)
    expect(saved.model).toBe(saved.key.model)
    expect(saved.maskedKey).toBe(saved.key.maskedKey)

    const listed = await caller.aiKeys.get()
    expect(listed.keys.length).toBe(1)
    expect(listed.items.length).toBe(1)
    expect(listed.keys[0]?.provider).toBe('openai')
    expect(listed.items[0]?.provider).toBe('openai')

    const deleted = await caller.aiKeys.delete({ provider: 'openai' })
    expect(deleted.success).toBe(true)

    const afterDelete = await caller.aiKeys.get()
    expect(afterDelete.keys.length).toBe(0)
  })

  it('testConnection returns NO_API_KEY when no key configured', async () => {
    const db = createMockDb()
    const caller = createTestCaller(db, {
      id: 'user-2',
      email: 'u2@test.local',
      name: 'User 2',
      role: 'member',
    })

    await expect(caller.aiKeys.testConnection({ provider: 'openai' })).rejects.toThrow('NO_API_KEY')
  })
})
