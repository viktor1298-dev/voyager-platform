import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param plaintext - The string to encrypt
 * @param key - 64-char hex string (32 bytes)
 * @returns `iv:authTag:ciphertext` (all hex-encoded)
 */
export function encryptCredential(plaintext: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt a cipher string produced by `encryptCredential`.
 * @param cipher - `iv:authTag:ciphertext` (all hex-encoded)
 * @param key - 64-char hex string (32 bytes)
 * @returns The original plaintext string
 */
export function decryptCredential(cipher: string, key: string): string {
  const [ivHex, authTagHex, ciphertextHex] = cipher.split(':')
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Invalid cipher format: expected iv:authTag:ciphertext')
  }
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
