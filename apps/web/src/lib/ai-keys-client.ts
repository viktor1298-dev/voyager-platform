import { createTRPCClientProxy, getUntypedClient } from '@trpc/client'
import type { AppRouter } from '@voyager/api/types'
import {
  type AiKeyRecord,
  type UiAiProvider as AiProvider,
  type BackendAiProvider,
  normalizeGetResponse,
  normalizeSaveResponse,
  normalizeTestConnectionResponse,
} from '@/lib/ai-keys-contract'
import { getTRPCClient } from '@/lib/trpc'

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
  testStoredConnection?: ProcedureCaller<{ provider: BackendAiProvider }, unknown>
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unknown error'
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object' || typeof value === 'function') {
    return value as Record<string, unknown>
  }
  return null
}

function getAiKeyNamespace(): AiKeyNamespace | null {
  const proxyClient = createTRPCClientProxy<AppRouter>(getUntypedClient(getTRPCClient()))
  const clientRecord = getRecord(proxyClient)
  if (!clientRecord) return null

  const direct = getRecord(clientRecord.aiKeys)
  if (direct) return direct as AiKeyNamespace

  const aiNamespace = getRecord(clientRecord.ai)
  const nestedKeys = aiNamespace ? getRecord(aiNamespace.keys) : null
  if (nestedKeys) return nestedKeys as AiKeyNamespace

  return null
}

function getErrorMessage(error: unknown): string {
  const root = getRecord(error)
  const data = getRecord(root?.data)
  const shape = getRecord(root?.shape)
  const shapeData = getRecord(shape?.data)

  const messageCandidates = [root?.message, data?.message, shape?.message, shapeData?.message]
  const message = messageCandidates.find((value) => typeof value === 'string')

  return typeof message === 'string' ? message.toLowerCase() : ''
}

function isMissingProcedurePathError(error: unknown): boolean {
  const root = getRecord(error)
  const data = getRecord(root?.data)
  const shape = getRecord(root?.shape)
  const shapeData = getRecord(shape?.data)

  const normalizedMessage = getErrorMessage(error)

  const codeCandidates = [data?.code, shapeData?.code]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toUpperCase())

  if (codeCandidates.includes('NOT_FOUND')) {
    if (
      normalizedMessage.includes('procedure') ||
      normalizedMessage.includes('path') ||
      normalizedMessage.includes('router')
    ) {
      return true
    }
  }

  return (
    normalizedMessage.includes('no procedure') ||
    normalizedMessage.includes('no "query"-procedure on path') ||
    normalizedMessage.includes('no "mutation"-procedure on path') ||
    normalizedMessage.includes('invalid path') ||
    (normalizedMessage.includes('not found') &&
      (normalizedMessage.includes('procedure') || normalizedMessage.includes('path')))
  )
}

function isRecoverableAiKeyReadError(error: unknown): boolean {
  const normalizedMessage = getErrorMessage(error)

  return (
    normalizedMessage.includes('encrypted_key') ||
    normalizedMessage.includes('no such column') ||
    (normalizedMessage.includes('column') && normalizedMessage.includes('does not exist'))
  )
}

async function queryWithFallback(paths: string[]): Promise<unknown> {
  const untyped = getUntypedClient(getTRPCClient())

  for (const path of paths) {
    try {
      return await untyped.query(path, undefined)
    } catch (error) {
      if (isMissingProcedurePathError(error)) {
        continue
      }
      throw error
    }
  }

  return null
}

async function mutateWithFallback<TInput>(paths: string[], input: TInput): Promise<unknown> {
  const untyped = getUntypedClient(getTRPCClient())

  for (const path of paths) {
    try {
      return await untyped.mutation(path, input)
    } catch (error) {
      if (isMissingProcedurePathError(error)) {
        continue
      }
      throw error
    }
  }

  return null
}

export async function getAiKeySettings(): Promise<AiKeyRecord | null> {
  const namespace = getAiKeyNamespace()
  if (namespace?.get?.query) {
    try {
      const result = await namespace.get.query()
      return normalizeGetResponse(result)
    } catch (error) {
      if (isRecoverableAiKeyReadError(error)) {
        return null
      }
      if (!isMissingProcedurePathError(error)) {
        throw error
      }
    }
  }

  try {
    const fallback = await queryWithFallback(['aiKeys.get', 'ai.keys.get'])
    return normalizeGetResponse(fallback)
  } catch (error) {
    if (isRecoverableAiKeyReadError(error)) {
      return null
    }
    throw error
  }
}

export async function upsertAiKeySettings(input: UpsertAiKeyInput): Promise<AiKeyRecord> {
  const namespace = getAiKeyNamespace()

  const save = namespace?.save?.mutate
  const upsert = namespace?.upsert?.mutate
  const mutate = save ?? upsert

  let raw: unknown = null
  if (mutate) {
    raw = await mutate(input)
  } else {
    raw = await mutateWithFallback(
      ['aiKeys.save', 'ai.keys.save', 'aiKeys.upsert', 'ai.keys.upsert'],
      input,
    )
  }

  if (!raw) {
    throw new Error('AI key save route is unavailable')
  }

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

  try {
    if (input.apiKey?.trim()) {
      if (namespace?.testConnection?.mutate) {
        const result = await namespace.testConnection.mutate(input)
        return normalizeTestConnectionResponse(result)
      }

      const fallback = await mutateWithFallback(
        ['aiKeys.testConnection', 'ai.keys.testConnection'],
        input,
      )
      if (!fallback) {
        return { ok: false, message: 'AI key test route is unavailable' }
      }
      return normalizeTestConnectionResponse(fallback)
    }

    if (namespace?.testStoredConnection?.mutate) {
      const result = await namespace.testStoredConnection.mutate({ provider: input.provider })
      return normalizeTestConnectionResponse(result)
    }

    const fallback = await mutateWithFallback(
      ['aiKeys.testStoredConnection', 'ai.keys.testStoredConnection'],
      {
        provider: input.provider,
      },
    )
    if (!fallback) {
      return { ok: false, message: 'AI saved-key test route is unavailable' }
    }
    return normalizeTestConnectionResponse(fallback)
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
