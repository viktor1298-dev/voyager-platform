import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptApiKey, encryptApiKey } from '../services/ai-key-crypto.js'

describe('ai-key-crypto', () => {
  const originalEnv = process.env.AI_KEYS_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.AI_KEYS_ENCRYPTION_KEY = 'test-byok-secret'
  })

  afterEach(() => {
    process.env.AI_KEYS_ENCRYPTION_KEY = originalEnv
  })

  it('encrypts and decrypts API key round-trip', () => {
    const raw = 'sk-test-1234567890'
    const encrypted = encryptApiKey(raw)

    expect(encrypted).not.toBe(raw)
    expect(decryptApiKey(encrypted)).toBe(raw)
  })

  it('rejects invalid encrypted payload format', () => {
    expect(() => decryptApiKey('invalid-payload')).toThrow('invalid payload format')
  })
})
