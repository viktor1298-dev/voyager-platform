export type UiAiProvider = 'anthropic' | 'openai'
export type BackendAiProvider = 'claude' | 'openai'

export interface AiKeyRecord {
  provider: UiAiProvider
  model: string
  maskedKey: string
  hasKey: boolean
  updatedAt: string | null
}

const DEFAULT_MODEL_BY_PROVIDER: Record<UiAiProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return null
}

export function mapUiProviderToBackend(provider: UiAiProvider): BackendAiProvider {
  return provider === 'anthropic' ? 'claude' : 'openai'
}

export function mapBackendProviderToUi(provider: unknown): UiAiProvider {
  return provider === 'openai' ? 'openai' : 'anthropic'
}

function normalizeKeyLike(input: unknown): AiKeyRecord | null {
  const source = asRecord(input)
  if (!source) return null

  const provider = mapBackendProviderToUi(source.provider)
  const model =
    typeof source.model === 'string' && source.model.trim().length > 0
      ? source.model
      : DEFAULT_MODEL_BY_PROVIDER[provider]

  const maskedKey = typeof source.maskedKey === 'string' ? source.maskedKey : ''
  const hasKey =
    typeof source.hasKey === 'boolean'
      ? source.hasKey
      : typeof source.apiKey === 'string' && source.apiKey.length > 0
        ? true
        : maskedKey.length > 0

  const updatedAt = toIsoDate(source.updatedAt)

  if (!hasKey && maskedKey.length === 0) return null

  return {
    provider,
    model,
    maskedKey,
    hasKey,
    updatedAt,
  }
}

export function normalizeGetResponse(payload: unknown): AiKeyRecord | null {
  const root = asRecord(payload)
  if (!root) return null

  const keys = Array.isArray(root.keys) ? root.keys : []
  for (const rawKey of keys) {
    const normalized = normalizeKeyLike(rawKey)
    if (normalized) return normalized
  }

  return null
}

export function normalizeSaveResponse(payload: unknown): AiKeyRecord | null {
  const root = asRecord(payload)
  if (!root) return null

  return normalizeKeyLike(root.key)
}

export function normalizeTestConnectionResponse(payload: unknown): {
  ok: boolean
  message: string
} {
  const root = asRecord(payload)

  const success = typeof root?.success === 'boolean' ? root.success : false
  const provider = mapBackendProviderToUi(root?.provider)
  const model = typeof root?.model === 'string' && root.model.length > 0 ? root.model : null

  if (!success) {
    return { ok: false, message: 'Connection failed' }
  }

  if (model) {
    return { ok: true, message: `Connection succeeded (${provider}/${model})` }
  }

  return { ok: true, message: `Connection succeeded (${provider})` }
}
