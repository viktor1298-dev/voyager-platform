import { InMemoryProvider, OpenFeature, type EvaluationContext, type JsonValue } from '@openfeature/server-sdk'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type PrimitiveFlag = boolean | string | number | JsonValue

type RawFlags = Record<string, PrimitiveFlag>

const FEATURE_FLAGS_FILE = process.env.FEATURE_FLAGS_FILE ?? resolve(process.cwd(), 'feature-flags.json')
const FEATURE_FLAG_ENV_PREFIX = 'FEATURE_FLAG_'

function parseEnvValue(raw: string): PrimitiveFlag {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false

  const asNumber = Number(raw)
  if (!Number.isNaN(asNumber) && raw.trim() !== '') {
    return asNumber
  }

  try {
    return JSON.parse(raw) as JsonValue
  } catch {
    return raw
  }
}

function loadFlagsFromFile(): RawFlags {
  if (!existsSync(FEATURE_FLAGS_FILE)) return {}

  try {
    const raw = readFileSync(FEATURE_FLAGS_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as RawFlags
  } catch {
    return {}
  }
}

function loadFlagsFromEnv(): RawFlags {
  const entries = Object.entries(process.env)
    .filter(([key, value]) => key.startsWith(FEATURE_FLAG_ENV_PREFIX) && value !== undefined)
    .map(([key, value]) => [key.replace(FEATURE_FLAG_ENV_PREFIX, '').toLowerCase(), parseEnvValue(value ?? '')] as const)

  return Object.fromEntries(entries)
}

function buildProviderConfig() {
  const merged = {
    ...loadFlagsFromFile(),
    ...loadFlagsFromEnv(),
  }

  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [
      key,
      {
        disabled: false,
        defaultVariant: 'on',
        variants: {
          on: value,
        },
      },
    ]),
  )
}

const provider = new InMemoryProvider(buildProviderConfig())
OpenFeature.setProviderAndWait(provider).catch(() => {
  // no-op: fallback behavior handled by default values in getFeatureFlag
})

const client = OpenFeature.getClient('voyager-api')

export async function getFeatureFlag<T extends PrimitiveFlag>(
  flagName: string,
  defaultValue: T,
  context?: EvaluationContext,
): Promise<T> {
  if (typeof defaultValue === 'boolean') {
    return (await client.getBooleanValue(flagName, defaultValue, context)) as T
  }

  if (typeof defaultValue === 'number') {
    return (await client.getNumberValue(flagName, defaultValue, context)) as T
  }

  if (typeof defaultValue === 'string') {
    return (await client.getStringValue(flagName, defaultValue, context)) as T
  }

  return (await client.getObjectValue(flagName, defaultValue as JsonValue, context)) as T
}

export function getConfiguredFeatureFlags(): RawFlags {
  return {
    ...loadFlagsFromFile(),
    ...loadFlagsFromEnv(),
  }
}
