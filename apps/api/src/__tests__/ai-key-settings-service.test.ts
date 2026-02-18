import { afterEach, describe, expect, it } from 'vitest'
import { AiKeySettingsService } from '../services/ai-key-settings-service.js'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

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
