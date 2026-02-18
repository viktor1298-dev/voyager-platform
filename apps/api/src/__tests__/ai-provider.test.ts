import { afterEach, describe, expect, it } from 'vitest'
import { readAiProviderConfigFromEnv } from '../services/ai-provider.js'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('readAiProviderConfigFromEnv', () => {
  it('loads openai config by default', () => {
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'sk-test'
    process.env.AI_MODEL = 'gpt-test'

    const config = readAiProviderConfigFromEnv()
    expect(config.provider).toBe('openai')
    expect(config.model).toBe('gpt-test')
  })

  it('requires anthropic key when anthropic provider is selected', () => {
    process.env.AI_PROVIDER = 'anthropic'
    delete process.env.ANTHROPIC_API_KEY

    expect(() => readAiProviderConfigFromEnv()).toThrow('ANTHROPIC_API_KEY is required')
  })
})
