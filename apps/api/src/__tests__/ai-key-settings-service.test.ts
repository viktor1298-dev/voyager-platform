import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@voyager/db', () => ({
  userAiKeys: {
    id: Symbol('id'),
    userId: Symbol('user_id'),
    provider: Symbol('provider'),
    encryptedKey: Symbol('encrypted_key'),
    model: Symbol('model'),
    updatedAt: Symbol('updated_at'),
  },
}))

import { userAiKeys } from '@voyager/db'
import { AiKeySettingsService } from '../services/ai-key-settings-service.js'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

function createDbMock() {
  const state: {
    upsertValues?: {
      userId: string
      provider: 'openai' | 'anthropic'
      encryptedKey: string
      model: string
    }
    onConflictArgs?: unknown
    selectRows: Array<{
      provider: 'openai' | 'anthropic'
      model: string
      encryptedKey: string
    }>
    deleteRows: Array<{ id: string }>
    selectLimitArgs: number[]
  } = {
    selectRows: [],
    deleteRows: [],
    selectLimitArgs: [],
  }

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((values) => {
        state.upsertValues = values
        return {
          onConflictDoUpdate: vi.fn(async (args) => {
            state.onConflictArgs = args
          }),
        }
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => state.selectRows),
          limit: vi.fn(async (value: number) => {
            state.selectLimitArgs.push(value)
            return state.selectRows.slice(0, value)
          }),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(async (value: number) => {
            state.selectLimitArgs.push(value)
            return state.selectRows.slice(0, value)
          }),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => state.deleteRows),
      })),
    })),
  }

  return { db, state }
}

describe('AiKeySettingsService encryption guard', () => {
  it('fails fast when AI_KEYS_ENCRYPTION_KEY is missing', async () => {
    delete process.env.AI_KEYS_ENCRYPTION_KEY

    const service = new AiKeySettingsService({} as any)

    await expect(
      service.upsertUserKey({
        userId: 'user-1',
        provider: 'openai',
        apiKey: 'sk-test-1234567890',
        model: 'gpt-4.1-mini',
      }),
    ).rejects.toThrow('AI_KEYS_ENCRYPTION_KEY is not configured')
  })
})

describe('AiKeySettingsService key lifecycle', () => {
  beforeEach(() => {
    process.env.AI_KEYS_ENCRYPTION_KEY = 'a'.repeat(32)
  })

  it('uses user_id + provider conflict target to preserve one-key-per-provider invariant', async () => {
    const { db, state } = createDbMock()
    const service = new AiKeySettingsService(db as any)

    await service.upsertUserKey({
      userId: 'user-1',
      provider: 'openai',
      apiKey: 'sk-live-very-secret-key',
      model: 'gpt-4.1-mini',
    })

    expect(db.insert).toHaveBeenCalledWith(userAiKeys)
    expect(state.onConflictArgs).toMatchObject({
      target: [userAiKeys.userId, userAiKeys.provider],
    })
  })

  it('deleteUserKey returns deleted=true when row existed', async () => {
    const { db, state } = createDbMock()
    state.deleteRows = [{ id: 'row-1' }]
    const service = new AiKeySettingsService(db as any)

    await expect(service.deleteUserKey({ userId: 'user-1', provider: 'openai' })).resolves.toEqual({
      deleted: true,
    })
  })

  it('deleteUserKey returns deleted=false when no row matched', async () => {
    const { db } = createDbMock()
    const service = new AiKeySettingsService(db as any)

    await expect(service.deleteUserKey({ userId: 'user-1', provider: 'openai' })).resolves.toEqual({
      deleted: false,
    })
  })

  it('testStoredConnection returns a friendly error when key is missing', async () => {
    const { db } = createDbMock()
    const service = new AiKeySettingsService(db as any)

    await expect(
      service.testStoredConnection({ userId: 'user-1', provider: 'anthropic' }),
    ).resolves.toEqual({
      ok: false,
      provider: 'anthropic',
      error: 'No saved key found for this provider',
    })
  })

  it('testStoredConnection decrypts and forwards the stored key to testConnection (success)', async () => {
    const { db, state } = createDbMock()
    const service = new AiKeySettingsService(db as any)

    await service.upsertUserKey({
      userId: 'user-1',
      provider: 'openai',
      apiKey: 'sk-test-forward-me-123456',
      model: 'gpt-4.1-mini',
    })

    state.selectRows = [
      {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        encryptedKey: state.upsertValues!.encryptedKey,
      },
    ]

    const testConnectionSpy = vi.spyOn(service, 'testConnection').mockResolvedValue({
      ok: true,
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })

    await expect(
      service.testStoredConnection({ userId: 'user-1', provider: 'openai' }),
    ).resolves.toEqual({
      ok: true,
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })

    expect(testConnectionSpy).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test-forward-me-123456',
    })
  })

  it('testStoredConnection decrypts and forwards the stored key to testConnection (failure)', async () => {
    const { db, state } = createDbMock()
    const service = new AiKeySettingsService(db as any)

    await service.upsertUserKey({
      userId: 'user-1',
      provider: 'anthropic',
      apiKey: 'sk-ant-fail-path-123456',
      model: 'claude-3-7-sonnet-latest',
    })

    state.selectRows = [
      {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-latest',
        encryptedKey: state.upsertValues!.encryptedKey,
      },
    ]

    vi.spyOn(service, 'testConnection').mockResolvedValue({
      ok: false,
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-latest',
      error: 'Invalid provider credentials. Please verify the API key and model.',
    })

    await expect(
      service.testStoredConnection({ userId: 'user-1', provider: 'anthropic' }),
    ).resolves.toEqual({
      ok: false,
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-latest',
      error: 'Invalid provider credentials. Please verify the API key and model.',
    })
  })

  it('testStoredConnection enforces deterministic single-row fetch with limit(1)', async () => {
    const { db, state } = createDbMock()
    const service = new AiKeySettingsService(db as any)

    await service.upsertUserKey({
      userId: 'user-1',
      provider: 'openai',
      apiKey: 'sk-test-first-row-123456',
      model: 'gpt-4.1-mini',
    })

    state.selectRows = [
      {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        encryptedKey: state.upsertValues!.encryptedKey,
      },
      {
        provider: 'openai',
        model: 'gpt-4.1-nano',
        encryptedKey: state.upsertValues!.encryptedKey,
      },
    ]

    const testConnectionSpy = vi.spyOn(service, 'testConnection').mockResolvedValue({
      ok: true,
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })

    await service.testStoredConnection({ userId: 'user-1', provider: 'openai' })

    expect(state.selectLimitArgs).toContain(1)
    expect(testConnectionSpy).toHaveBeenCalledTimes(1)
    expect(testConnectionSpy).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test-first-row-123456',
    })
  })
})
