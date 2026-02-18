import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { AI_CONFIG, type AiProviderName } from '@voyager/config'
import type { Database } from '@voyager/db'
import { userAiKeys } from '@voyager/db'
import { and, desc, eq } from 'drizzle-orm'
import { AiProviderClient } from './ai-provider.js'

const KEY_ALGORITHM = 'aes-256-gcm'
const KEY_IV_BYTES = 12

const PROVIDER_VALIDATION_MESSAGES = {
  invalidCredentials: 'Invalid provider credentials. Please verify the API key and model.',
  modelUnavailable: 'The selected model is unavailable for this account.',
  rateLimited: 'Provider rate limit reached. Please retry shortly.',
  providerUnavailable: 'Provider is temporarily unavailable. Please retry shortly.',
  generic: 'Failed to validate provider credentials.',
} as const

function sanitizeProviderValidationError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()

  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('invalid api key') ||
    message.includes('authentication') ||
    message.includes('forbidden')
  ) {
    return PROVIDER_VALIDATION_MESSAGES.invalidCredentials
  }

  if (
    message.includes('404') ||
    message.includes('model') && (message.includes('not found') || message.includes('does not exist'))
  ) {
    return PROVIDER_VALIDATION_MESSAGES.modelUnavailable
  }

  if (message.includes('429') || message.includes('rate limit') || message.includes('quota')) {
    return PROVIDER_VALIDATION_MESSAGES.rateLimited
  }

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable')
  ) {
    return PROVIDER_VALIDATION_MESSAGES.providerUnavailable
  }

  return PROVIDER_VALIDATION_MESSAGES.generic
}


function resolveKeyMaterial(): Buffer {
  const raw = process.env.AI_KEYS_ENCRYPTION_KEY
  if (!raw) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'AI_KEYS_ENCRYPTION_KEY is not configured',
    })
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }

  try {
    const b64 = Buffer.from(raw, 'base64')
    if (b64.length === 32) {
      return b64
    }
  } catch {
    // ignore base64 parsing failures
  }

  if (raw.length === 32) {
    return Buffer.from(raw, 'utf8')
  }

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'AI_KEYS_ENCRYPTION_KEY must be 32-byte utf8, 64-char hex, or base64(32 bytes)',
  })
}

function encryptApiKey(plain: string): string {
  const iv = randomBytes(KEY_IV_BYTES)
  const cipher = createCipheriv(KEY_ALGORITHM, resolveKeyMaterial(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

function decryptApiKey(cipherText: string): string {
  const [ivBase64, authTagBase64, payloadBase64] = cipherText.split(':')
  if (!ivBase64 || !authTagBase64 || !payloadBase64) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Invalid encrypted AI key payload',
    })
  }

  const decipher = createDecipheriv(
    KEY_ALGORITHM,
    resolveKeyMaterial(),
    Buffer.from(ivBase64, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '*'.repeat(Math.max(apiKey.length, 4))
  }

  return `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 4))}${apiKey.slice(-4)}`
}

export class AiKeySettingsService {
  public constructor(private readonly db: Database) {}

  public async upsertUserKey(input: {
    userId: string
    provider: AiProviderName
    apiKey: string
    model: string
  }): Promise<{
    provider: AiProviderName
    model: string
    maskedKey: string
    hasKey: true
    updatedAt: Date
  }> {
    const encrypted = encryptApiKey(input.apiKey.trim())

    const updatedAt = new Date()

    await this.db
      .insert(userAiKeys)
      .values({
        userId: input.userId,
        provider: input.provider,
        encryptedKey: encrypted,
        model: input.model,
      })
      .onConflictDoUpdate({
        target: [userAiKeys.userId, userAiKeys.provider],
        set: {
          encryptedKey: encrypted,
          model: input.model,
          updatedAt,
        },
      })

    return {
      provider: input.provider,
      model: input.model,
      maskedKey: maskApiKey(input.apiKey),
      hasKey: true,
      updatedAt,
    }
  }

  public async getUserKeyStatus(input: { userId: string; provider?: AiProviderName }): Promise<
    Array<{
      provider: AiProviderName
      model: string
      maskedKey: string
      hasKey: true
      updatedAt: Date
    }>
  > {
    const rows = await this.db
      .select()
      .from(userAiKeys)
      .where(
        input.provider
          ? and(eq(userAiKeys.userId, input.userId), eq(userAiKeys.provider, input.provider))
          : eq(userAiKeys.userId, input.userId),
      )
      .orderBy(desc(userAiKeys.updatedAt))

    return rows.map((row) => {
      const decrypted = decryptApiKey(row.encryptedKey)
      return {
        provider: row.provider,
        model: row.model,
        maskedKey: maskApiKey(decrypted),
        hasKey: true as const,
        updatedAt: row.updatedAt,
      }
    })
  }

  public async deleteUserKey(input: {
    userId: string
    provider: AiProviderName
  }): Promise<{ deleted: boolean }> {
    const deletedRows = await this.db
      .delete(userAiKeys)
      .where(and(eq(userAiKeys.userId, input.userId), eq(userAiKeys.provider, input.provider)))
      .returning({ id: userAiKeys.id })

    return { deleted: deletedRows.length > 0 }
  }

  public async testStoredConnection(input: {
    userId: string
    provider: AiProviderName
  }): Promise<{ ok: boolean; provider: AiProviderName; model?: string; error?: string }> {
    const [row] = await this.db
      .select()
      .from(userAiKeys)
      .where(and(eq(userAiKeys.userId, input.userId), eq(userAiKeys.provider, input.provider)))
      .limit(1)

    if (!row) {
      return {
        ok: false,
        provider: input.provider,
        error: 'No saved key found for this provider',
      }
    }

    return this.testConnection({
      provider: row.provider,
      model: row.model,
      apiKey: decryptApiKey(row.encryptedKey),
    })
  }

  public async getPreferredUserProviderConfig(userId: string): Promise<
    | {
        provider: AiProviderName
        model: string
        apiKey: string
        timeoutMs: number
        maxOutputTokens: number
        baseUrl?: string
      }
    | undefined
  > {
    const [row] = await this.db
      .select()
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, userId))
      .orderBy(desc(userAiKeys.updatedAt))
      .limit(1)

    if (!row) {
      return undefined
    }

    const timeoutMs = Number.parseInt(
      process.env.AI_TIMEOUT_MS ?? `${AI_CONFIG.REQUEST_TIMEOUT_MS}`,
      10,
    )
    const maxOutputTokens = Number.parseInt(
      process.env.AI_MAX_OUTPUT_TOKENS ?? `${AI_CONFIG.MAX_OUTPUT_TOKENS}`,
      10,
    )

    return {
      provider: row.provider,
      model: row.model,
      apiKey: decryptApiKey(row.encryptedKey),
      timeoutMs,
      maxOutputTokens,
      baseUrl:
        row.provider === 'anthropic' ? process.env.ANTHROPIC_BASE_URL : process.env.OPENAI_BASE_URL,
    }
  }

  public async testConnection(input: {
    provider: AiProviderName
    model: string
    apiKey: string
  }): Promise<{ ok: boolean; provider: AiProviderName; model: string; error?: string }> {
    try {
      const timeoutMs = Number.parseInt(
        process.env.AI_TIMEOUT_MS ?? `${AI_CONFIG.REQUEST_TIMEOUT_MS}`,
        10,
      )
      const maxOutputTokens = Number.parseInt(
        process.env.AI_MAX_OUTPUT_TOKENS ?? `${AI_CONFIG.MAX_OUTPUT_TOKENS}`,
        10,
      )

      const client = new AiProviderClient({
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
        timeoutMs,
        maxOutputTokens,
        baseUrl:
          input.provider === 'anthropic'
            ? process.env.ANTHROPIC_BASE_URL
            : process.env.OPENAI_BASE_URL,
      })

      await client.complete({
        messages: [{ role: 'user', content: 'Reply exactly with OK' }],
        temperature: 0,
      })

      return { ok: true, provider: input.provider, model: input.model }
    } catch (error) {
      console.error('[ai.byok] Provider validation failed', {
        provider: input.provider,
        model: input.model,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        ok: false,
        provider: input.provider,
        model: input.model,
        error: sanitizeProviderValidationError(error),
      }
    }
  }
}
