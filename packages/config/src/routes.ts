/** API route path constants */

export const API_ROUTES = {
  TRPC: '/trpc',
  AUTH_PREFIX: '/api/auth',
  HEALTH: '/health',
  DOCS: '/docs',
  OPENAPI: '/openapi.json',
} as const

/** Paths that bypass authentication checks (used by auth-guard.ts) */
export const AUTH_BYPASS_PATHS = [
  '/api/auth/',
  '/health',
  '/docs',
  '/openapi.json',
  '/api/watches/health',
] as const

/** Paths exempt from rate limiting (used by server.ts) — separate from auth bypass */
export const RATE_LIMIT_BYPASS_PATHS = ['/api/auth/', '/health', '/trpc'] as const
