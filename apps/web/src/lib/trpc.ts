'use client'

import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { AppRouter } from '@voyager/api/types'

export const trpc = createTRPCReact<AppRouter>()

function clearAuthAndRedirect() {
  if (typeof window === 'undefined') return
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url:
          typeof window !== 'undefined'
            ? '/trpc'
            : process.env.API_URL || 'http://localhost:4000/trpc',
        // Better-Auth uses cookies automatically — no manual token headers needed
        fetch(url, options) {
          return fetch(url, { ...options, credentials: 'include' })
        },
      }),
    ],
  })
}

// Global error handler: redirect to login on UNAUTHORIZED
export function handleTRPCError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    (error as { data?: { code?: string } }).data?.code === 'UNAUTHORIZED'
  ) {
    clearAuthAndRedirect()
  }
}
