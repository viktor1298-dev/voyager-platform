'use client'

import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { AppRouter } from '@voyager/api/types'

export const trpc = createTRPCReact<AppRouter>()

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
