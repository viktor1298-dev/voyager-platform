import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

const CURRENT_VERSION = 'v1'

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Output is prefixed with `v1:` for future key rotation identification.
 * @param plaintext - The string to encrypt
 * @param key - 64-char hex string (32 bytes)
 * @returns `v1:iv:authTag:ciphertext` (all hex-encoded)
 */
export function encryptCredential(plaintext: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'hex')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${CURRENT_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt a cipher string produced by `encryptCredential`.
 * Supports both versioned (`v1:iv:authTag:ciphertext`) and legacy (`iv:authTag:ciphertext`) formats.
 * @param cipher - `v1:iv:authTag:ciphertext` or `iv:authTag:ciphertext` (all hex-encoded)
 * @param key - 64-char hex string (32 bytes)
 * @returns The original plaintext string
 */
export function decryptCredential(cipher: string, key: string): string {
  // Strip version prefix if present (backwards compatible with unversioned format)
  const stripped = cipher.startsWith(`${CURRENT_VERSION}:`)
    ? cipher.slice(CURRENT_VERSION.length + 1)
    : cipher
  const [ivHex, authTagHex, ciphertextHex] = stripped.split(':')
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Invalid cipher format: expected [v1:]iv:authTag:ciphertext')
  }
  const keyBuffer = Buffer.from(key, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
