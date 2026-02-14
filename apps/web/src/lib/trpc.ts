'use client'

import {
  createTRPCReact,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/react-query'
import type { AppRouter } from '@voyager/api/types'

export const trpc = createTRPCReact<AppRouter>()

function clearAuthAndRedirect() {
  if (typeof window === 'undefined') return
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return ''
  return process.env.API_URL || 'http://localhost:4000'
}

export function getTRPCClient() {
  const url = `${getBaseUrl()}/trpc`

  return trpc.createClient({
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: httpSubscriptionLink({
          url,
          eventSourceOptions() {
            return {
              withCredentials: true,
            }
          },
        }),
        false: httpBatchLink({
          url,
          // Better-Auth uses cookies automatically — no manual token headers needed
          fetch(url, options) {
            return fetch(url, { ...options, credentials: 'include' })
          },
        }),
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
