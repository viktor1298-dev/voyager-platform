'use client'

import {
  createTRPCReact,
  httpLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/react-query'
import type { AppRouter } from '@voyager/api/types'

export const trpc = createTRPCReact<AppRouter>()

function clearAuthAndRedirect() {
  if (typeof window === 'undefined') return

  const { pathname, search } = window.location
  if (pathname.startsWith('/login')) return

  const loginUrl = new URL('/login', window.location.origin)
  const currentSearchParams = new URLSearchParams(search)
  const logoutInProgress = window.sessionStorage.getItem('logoutInProgress')?.trim()
  const requestedReturnUrl = `${pathname}${search}`

  if (logoutInProgress) {
    loginUrl.searchParams.set('loggedOut', '1')
    loginUrl.searchParams.set('loggedOutAt', logoutInProgress)
    if (requestedReturnUrl !== '/login') {
      loginUrl.searchParams.set('returnUrl', requestedReturnUrl)
    }
    window.location.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
    return
  }

  if (currentSearchParams.get('loggedOut') === '1') {
    loginUrl.searchParams.set('loggedOut', '1')
    const loggedOutAt = currentSearchParams.get('loggedOutAt')
    if (loggedOutAt && loggedOutAt.trim().length > 0) {
      loginUrl.searchParams.set('loggedOutAt', loggedOutAt)
    }
    if (requestedReturnUrl !== '/login') {
      loginUrl.searchParams.set('returnUrl', requestedReturnUrl)
    }
    window.location.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
    return
  }

  loginUrl.searchParams.set('returnUrl', requestedReturnUrl)
  window.location.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
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
        false: httpLink({
          url,
          // Better-Auth uses cookies automatically — no manual token headers needed
          // Note: switched from httpBatchLink to httpLink to avoid 404s on long batched URLs (nginx limit)
          fetch(url, options) {
            return fetch(url, { ...options, credentials: 'include' })
          },
        }),
      }),
    ],
  })
}

// Global error handler: redirect to login on UNAUTHORIZED
// Handles both tRPC-formatted errors (data.code) and raw HTTP 401 responses
export function handleTRPCError(error: unknown) {
  if (!error || typeof error !== 'object') return

  const err = error as Record<string, unknown>

  // tRPC error format: { data: { code: 'UNAUTHORIZED' } }
  if ('data' in err && (err.data as { code?: string })?.code === 'UNAUTHORIZED') {
    clearAuthAndRedirect()
    return
  }

  // TRPCClientError with shape.data.code or top-level code
  if ('shape' in err) {
    const shape = err.shape as { data?: { code?: string } } | undefined
    if (shape?.data?.code === 'UNAUTHORIZED') {
      clearAuthAndRedirect()
      return
    }
  }

  // Raw HTTP 401 from non-tRPC middleware (e.g. auth guard)
  if ('message' in err && typeof err.message === 'string' && err.message.includes('UNAUTHORIZED')) {
    clearAuthAndRedirect()
  }
}
