/**
 * Shared authentication constants
 * Used across middleware, AuthGuard, and auth components
 */

export const PUBLIC_PATHS = ['/login'] as const

export const PUBLIC_PATH_PREFIXES = ['/auth/'] as const

/**
 * Better-Auth session cookie names
 *
 * Better-Auth may emit different names depending on deployment hardening:
 * - better-auth.session_token
 * - __Secure-better-auth.session_token
 * - __Host-better-auth.session_token
 */
export const SESSION_COOKIE_NAME = 'better-auth.session_token'
export const SECURE_SESSION_COOKIE_NAME = '__Secure-better-auth.session_token'
export const HOST_SESSION_COOKIE_NAME = '__Host-better-auth.session_token'

/**
 * Check if a pathname is publicly accessible (no auth required)
 */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname as typeof PUBLIC_PATHS[number]) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}
