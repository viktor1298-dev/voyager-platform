const DEV_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:9000'] as const
const VOYAGER_PLATFORM_ORIGIN = 'https://voyager-platform.voyagerlabs.co'

const isTruthy = (value: string | undefined): boolean => value === '1' || value?.toLowerCase() === 'true'

const parseOrigins = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

const validateProductionOrigin = (origin: string): void => {
  let parsed: URL

  try {
    parsed = new URL(origin)
  } catch {
    throw new Error(`Invalid ALLOWED_ORIGINS entry in production: ${origin}`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`ALLOWED_ORIGINS must contain only HTTPS origins in production. Invalid: ${origin}`)
  }

  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    throw new Error(`ALLOWED_ORIGINS must not include localhost in production. Invalid: ${origin}`)
  }
}

export const resolveTrustedOrigins = (env: NodeJS.ProcessEnv): string[] => {
  const isProduction = env.NODE_ENV === 'production'
  const configuredOrigins = parseOrigins(env.ALLOWED_ORIGINS)

  if (isProduction) {
    if (configuredOrigins.length === 0) {
      throw new Error('ALLOWED_ORIGINS is required in production and must include at least one HTTPS origin')
    }

    configuredOrigins.forEach(validateProductionOrigin)
    return Array.from(new Set(configuredOrigins))
  }

  const allowVoyagerPlatformOrigin = isTruthy(env.ALLOW_VOYAGER_PLATFORM_ORIGIN)
  const nonProdOrigins = configuredOrigins.length > 0 ? configuredOrigins : [...DEV_ALLOWED_ORIGINS]

  if (allowVoyagerPlatformOrigin) {
    nonProdOrigins.push(VOYAGER_PLATFORM_ORIGIN)
  }

  return Array.from(new Set(nonProdOrigins))
}
