'use client'

import { getTRPCClient, trpc, handleTRPCError } from '@/lib/trpc'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          handleTRPCError(error)
          return failureCount < 3
        },
      },
      mutations: {
        onError: handleTRPCError,
      },
    },
  }))
  const [trpcClient] = useState(() => getTRPCClient())

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
