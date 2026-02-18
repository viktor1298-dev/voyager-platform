import { getTRPCClient } from '@/lib/trpc'

export type AiProvider = 'anthropic' | 'openai'

export interface AiKeyRecord {
  provider: AiProvider
  model: string
  maskedKey: string
  hasKey: boolean
  updatedAt: string | null
}

interface UpsertAiKeyInput {
  provider: AiProvider
  apiKey: string
  model: string
}

interface TestConnectionInput {
  provider: AiProvider
  apiKey: string
  model: string
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unknown error'
}

export async function getAiKeySettings(): Promise<AiKeyRecord | null> {
  try {
    const client = getTRPCClient() as unknown as {
      aiKeys?: {
        get?: {
          query: () => Promise<AiKeyRecord | null>
        }
      }
    }

    if (!client.aiKeys?.get?.query) {
      return null
    }

    return await client.aiKeys.get.query()
  } catch {
    return null
  }
}

export async function upsertAiKeySettings(input: UpsertAiKeyInput): Promise<AiKeyRecord> {
  const client = getTRPCClient() as unknown as {
    aiKeys?: {
      upsert?: {
        mutate: (payload: UpsertAiKeyInput) => Promise<AiKeyRecord>
      }
    }
  }

  if (!client.aiKeys?.upsert?.mutate) {
    throw new Error('aiKeys.upsert route is unavailable')
  }

  return client.aiKeys.upsert.mutate(input)
}

export async function testAiKeyConnection(input: TestConnectionInput): Promise<{ ok: boolean; message: string }> {
  const client = getTRPCClient() as unknown as {
    aiKeys?: {
      testConnection?: {
        mutate: (payload: TestConnectionInput) => Promise<{ ok: boolean; message?: string }>
      }
    }
  }

  if (!client.aiKeys?.testConnection?.mutate) {
    return { ok: false, message: 'aiKeys.testConnection route is unavailable' }
  }

  try {
    const result = await client.aiKeys.testConnection.mutate(input)
    return {
      ok: Boolean(result.ok),
      message: result.message ?? (result.ok ? 'Connection succeeded' : 'Connection failed'),
    }
  } catch (error) {
    return {
      ok: false,
      message: toErrorMessage(error),
    }
  }
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (!trimmed) return '••••••'

  const prefix = trimmed.slice(0, 7)
  return `${prefix}...***`
}
