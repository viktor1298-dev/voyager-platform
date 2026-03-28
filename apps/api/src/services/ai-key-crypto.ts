import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

type UserAiKeyProvider = 'openai' | 'claude'

export interface DecryptedUserAiKey {
  provider: UserAiKeyProvider
  apiKey: string
  model: string
}

function readEncryptionSecret(): string {
  const secret = process.env.AI_KEYS_ENCRYPTION_KEY ?? process.env.AI_KEY_ENCRYPTION_KEY
  if (!secret?.trim()) {
    throw new Error('AI_KEYS_ENCRYPTION_KEY is required for BYOK encryption/decryption operations')
  }

  return secret.trim()
}

function deriveAesKey(): Buffer {
  const secret = readEncryptionSecret()
  return createHash('sha256').update(secret).digest()
}

export function encryptApiKey(rawApiKey: string): string {
  const key = deriveAesKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(rawApiKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptApiKey(ciphertext: string): string {
  const [ivB64, tagB64, encryptedB64] = ciphertext.split(':')
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Encrypted key has invalid payload format')
  }

  const key = deriveAesKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(encryptedB64, 'base64')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (!trimmed) return ''

  if (trimmed.length <= 8) {
    return '*'.repeat(trimmed.length)
  }

  return `${trimmed.slice(0, 4)}${'*'.repeat(Math.max(4, trimmed.length - 8))}${trimmed.slice(-4)}`
}
