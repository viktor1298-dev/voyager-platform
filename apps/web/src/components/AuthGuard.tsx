'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { authClient } from '@/lib/auth-client'

const PUBLIC_PATHS = ['/login']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading, setUser, logout } = useAuthStore()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (isPending) return
    if (session?.user) {
      setUser({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? session.user.email,
        role: (session.user as { role?: string }).role === 'admin' ? 'admin' : 'viewer',
      })
    } else {
      logout()
    }
  }, [session, isPending, setUser, logout])

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) return
    if (!isPending && !isLoading && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, isLoading, isPending, pathname, router])

  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>
  if (isPending || isLoading) return null
  if (!isAuthenticated) return null

  return <>{children}</>
}
