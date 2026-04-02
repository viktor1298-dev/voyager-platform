'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { ThemeProvider } from 'next-themes'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { getTRPCClient, handleTRPCError, trpc } from '@/lib/trpc'
import { useAuthStore } from '@/stores/auth'
import dynamic from 'next/dynamic'

const CommandPalette = dynamic(
  () => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
)
import { KeyboardShortcuts } from './KeyboardShortcuts'
import { TimeAgoProvider } from './shared/TimeAgoProvider'
const TerminalDrawer = dynamic(
  () => import('./terminal/TerminalDrawer').then((m) => ({ default: m.TerminalDrawer })),
  { ssr: false },
)
import { TerminalProvider } from './terminal/terminal-context'

/**
 * Sanitize a display name from the auth session.
 * Strips unfilled template placeholders like <fill-admin-name> or <fill-bootstrap-admin-name>
 * that may have been seeded via Helm chart values without replacement.
 */
function sanitizeDisplayName(name: string | null | undefined, fallback: string): string {
  if (!name || !name.trim()) return fallback
  // Detect unfilled placeholders: strings starting with '<' and ending with '>'
  if (/^<[^>]+>$/.test(name.trim())) return fallback
  return name
}

function AuthSessionSync() {
  const { data: session, isPending } = authClient.useSession()
  const setUser = useAuthStore((state) => state.setUser)
  const clearUser = useAuthStore((state) => state.clearUser)

  useEffect(() => {
    if (isPending) return

    if (session?.user) {
      setUser({
        id: session.user.id,
        email: session.user.email,
        name: sanitizeDisplayName(session.user.name, session.user.email),
        role: (session.user as { role?: string }).role === 'admin' ? 'admin' : 'viewer',
      })
      return
    }

    clearUser()
  }, [session, isPending, setUser, clearUser])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: (failureCount, error) => {
              handleTRPCError(error)
              const MAX_RETRIES = 3
              return failureCount < MAX_RETRIES
            },
          },
          mutations: {
            onError: handleTRPCError,
          },
        },
      }),
  )
  const [trpcClient] = useState(() => getTRPCClient())

  // P3-013: LazyMotion saves ~23kb gzipped by loading only domAnimation features
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <TerminalProvider>
                <TimeAgoProvider>
                  <AuthSessionSync />
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
                  <TerminalDrawer />
                </TimeAgoProvider>
              </TerminalProvider>
            </QueryClientProvider>
          </trpc.Provider>
        </ThemeProvider>
      </MotionConfig>
    </LazyMotion>
  )
}
