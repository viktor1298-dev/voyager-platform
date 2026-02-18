import { describe, expect, it, vi, beforeEach } from 'vitest'

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

import {
  aiKeysGetInputSchema,
  aiKeysGetOutputSchema,
  aiKeysSaveInputSchema,
  aiKeysSaveOutputSchema,
  aiKeysTestConnectionInputSchema,
  aiKeysTestConnectionOutputSchema,
} from '@voyager/types'
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
          const existing = records.find((r) => r.userId === value.userId && r.provider === value.provider)
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

describe('aiKeys router contract compatibility', () => {
  beforeEach(() => {
    process.env.AI_KEYS_ENCRYPTION_KEY = 'contract-test-secret'
  })

  it('matches shared save/get/testConnection schemas used by adapters', async () => {
    const db = createMockDb()
    const caller = createTestCaller(db, {
      id: 'user-contract',
      email: 'contract@test.local',
      name: 'Contract User',
      role: 'member',
    })

    const saveInput = aiKeysSaveInputSchema.parse({
      provider: 'openai',
      apiKey: 'sk-test-12345',
      model: 'gpt-4o-mini',
    })

    const saveResponse = aiKeysSaveOutputSchema.parse(await caller.aiKeys.save(saveInput))
    expect(saveResponse.provider).toBe(saveResponse.key.provider)
    expect(saveResponse.model).toBe(saveResponse.key.model)
    expect(saveResponse.maskedKey).toBe(saveResponse.key.maskedKey)

    const getInput = aiKeysGetInputSchema.parse(undefined)
    const getResponse = aiKeysGetOutputSchema.parse(await caller.aiKeys.get(getInput))

    expect(getResponse.keys.length).toBe(1)
    expect(getResponse.items.length).toBe(1)
    expect(getResponse.items[0]).toEqual(getResponse.keys[0])

    const testConnectionInput = aiKeysTestConnectionInputSchema.parse({ provider: 'openai' })
    const testConnectionResponse = aiKeysTestConnectionOutputSchema.parse(
      await caller.aiKeys.testConnection(testConnectionInput),
    )

    expect(testConnectionResponse.success).toBe(true)
    expect(testConnectionResponse.provider).toBe('openai')
  })

  it('preserves compatibility fields for claude payloads and validates testConnection contract', async () => {
    const db = createMockDb()
    const caller = createTestCaller(db, {
      id: 'user-contract-claude',
      email: 'claude@test.local',
      name: 'Claude Contract User',
      role: 'member',
    })

    const saveInput = aiKeysSaveInputSchema.parse({
      provider: 'claude',
      apiKey: 'sk-ant-test-67890',
      model: 'claude-3-5-sonnet',
    })

    const saveResponse = aiKeysSaveOutputSchema.parse(await caller.aiKeys.save(saveInput))
    expect(saveResponse.key.provider).toBe('claude')
    expect(saveResponse.provider).toBe('claude')
    expect(saveResponse.model).toBe(saveResponse.key.model)
    expect(saveResponse.maskedKey).toBe(saveResponse.key.maskedKey)

    const getResponse = aiKeysGetOutputSchema.parse(await caller.aiKeys.get())
    expect(getResponse.keys.length).toBe(1)
    expect(getResponse.items.length).toBe(1)
    expect(getResponse.items[0]).toEqual(getResponse.keys[0])
    expect(getResponse.keys[0]?.provider).toBe('claude')

    const testConnectionResponse = aiKeysTestConnectionOutputSchema.parse(
      await caller.aiKeys.testConnection(aiKeysTestConnectionInputSchema.parse({ provider: 'claude' })),
    )

    expect(testConnectionResponse.success).toBe(true)
    expect(testConnectionResponse.provider).toBe('claude')
    expect(testConnectionResponse.model).toBe('claude-3-5-sonnet')
  })
})
