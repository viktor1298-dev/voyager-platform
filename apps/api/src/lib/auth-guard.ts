const PUBLIC_PATH_PREFIXES = ['/api/auth/', '/health', '/system-health', '/docs', '/openapi.json'] as const
const PROTECTED_API_PREFIXES = ['/trpc/', '/api/'] as const
const PUBLIC_TRPC_PROCEDURES = new Set(['sso.getProviders'])

export const UNAUTHORIZED_RESPONSE = {
  error: 'Unauthorized',
  code: 'UNAUTHORIZED',
} as const

const normalizePathname = (url: string): string => {
  const [pathname] = url.split('?')
  return pathname || '/'
}

const getTrpcProcedureNames = (pathname: string): string[] => {
  if (!pathname.startsWith('/trpc/')) return []
  const rawNames = pathname.slice('/trpc/'.length)
  if (!rawNames) return []

  return rawNames
    .split(',')
    .map((name) => decodeURIComponent(name).trim())
    .filter(Boolean)
}

const isPublicPath = (pathname: string): boolean => {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))
}

const isProtectedApiPath = (pathname: string): boolean => {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && !pathname.startsWith('/api/auth/')
}

const isPublicTrpcRequest = (pathname: string): boolean => {
  const procedures = getTrpcProcedureNames(pathname)
  if (procedures.length === 0) return false
  return procedures.every((procedure) => PUBLIC_TRPC_PROCEDURES.has(procedure))
}

export const shouldRequireAuth = (method: string, url: string): boolean => {
  if (method.toUpperCase() === 'OPTIONS') return false

  const pathname = normalizePathname(url)

  if (isPublicPath(pathname)) return false
  if (!isProtectedApiPath(pathname)) return false
  if (isPublicTrpcRequest(pathname)) return false

  return true
}
