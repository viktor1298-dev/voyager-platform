'use client'

import { getTRPCClient, trpc, handleTRPCError } from '@/lib/trpc'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { useState } from 'react'
import { CommandPalette } from './CommandPalette'
import { KeyboardShortcuts } from './KeyboardShortcuts'

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
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              className: 'font-sans',
              style: {
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              },
            }}
          />
          <CommandPalette />
          <KeyboardShortcuts />
        </QueryClientProvider>
      </trpc.Provider>
    </ThemeProvider>
  )
}
