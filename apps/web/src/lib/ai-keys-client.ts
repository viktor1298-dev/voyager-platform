import { getTRPCClient } from '@/lib/trpc'
import {
  mapUiProviderToBackend,
  normalizeGetResponse,
  normalizeSaveResponse,
  normalizeTestConnectionResponse,
  type AiKeyRecord,
  type BackendAiProvider,
  type UiAiProvider as AiProvider,
} from '@/lib/ai-keys-contract'

export type { AiProvider }

interface UpsertAiKeyInput {
  provider: AiProvider
  apiKey: string
  model: string
}

interface TestConnectionInput {
  provider: AiProvider
  model: string
  apiKey?: string
}

interface BackendUpsertAiKeyInput {
  provider: BackendAiProvider
  apiKey: string
  model: string
}

interface BackendTestConnectionInput {
  provider: BackendAiProvider
  model: string
  apiKey?: string
}

interface ProcedureCaller<TInput, TOutput> {
  mutate?: (payload: TInput) => Promise<TOutput>
  query?: (payload?: TInput) => Promise<TOutput>
}

interface AiKeyNamespace {
  get?: ProcedureCaller<void, unknown>
  save?: ProcedureCaller<BackendUpsertAiKeyInput, unknown>
  upsert?: ProcedureCaller<BackendUpsertAiKeyInput, unknown>
  testConnection?: ProcedureCaller<BackendTestConnectionInput, unknown>
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unknown error'
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function getAiKeyNamespace(): AiKeyNamespace | null {
  const client = getTRPCClient()
  const clientRecord = getRecord(client)
  if (!clientRecord) return null

  const direct = getRecord(clientRecord.aiKeys)
  if (direct) return direct as AiKeyNamespace

  const aiNamespace = getRecord(clientRecord.ai)
  const nestedKeys = aiNamespace ? getRecord(aiNamespace.keys) : null
  if (nestedKeys) return nestedKeys as AiKeyNamespace

  return null
}

export async function getAiKeySettings(): Promise<AiKeyRecord | null> {
  try {
    const namespace = getAiKeyNamespace()
    if (!namespace?.get?.query) {
      return null
    }

    const result = await namespace.get.query()
    return normalizeGetResponse(result)
  } catch {
    return null
  }
}

export async function upsertAiKeySettings(input: UpsertAiKeyInput): Promise<AiKeyRecord> {
  const namespace = getAiKeyNamespace()

  const save = namespace?.save?.mutate
  const upsert = namespace?.upsert?.mutate
  const mutate = save ?? upsert

  if (!mutate) {
    throw new Error('AI key save route is unavailable')
  }

  const raw = await mutate({
    ...input,
    provider: mapUiProviderToBackend(input.provider),
  })
  const normalized = normalizeSaveResponse(raw)
  if (!normalized) {
    throw new Error('AI key save response is invalid')
  }

  return normalized
}

export async function testAiKeyConnection(
  input: TestConnectionInput,
): Promise<{ ok: boolean; message: string }> {
  const namespace = getAiKeyNamespace()

  if (!namespace?.testConnection?.mutate) {
    return { ok: false, message: 'AI key test route is unavailable' }
  }

  try {
    const result = await namespace.testConnection.mutate({
      ...input,
      provider: mapUiProviderToBackend(input.provider),
    })
    return normalizeTestConnectionResponse(result)
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
