'use client'

import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import { TRPCClientError } from '@trpc/client'
import type { AppRouter } from '@voyager/api/types'

export const trpc = createTRPCReact<AppRouter>()

function clearAuthAndRedirect() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('voyager-token')
  document.cookie = 'voyager-token=; path=/; max-age=0'
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
        headers() {
          if (typeof window === 'undefined') return {}
          const token = localStorage.getItem('voyager-token')
          return token ? { Authorization: `Bearer ${token}` } : {}
        },
      }),
    ],
  })
}

// Global error handler: redirect to login on UNAUTHORIZED
export function handleTRPCError(error: unknown) {
  if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
    clearAuthAndRedirect()
  }
}
