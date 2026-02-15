'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { authClient } from '@/lib/auth-client'
import { useAuthStore } from '@/stores/auth'

const PUBLIC_PATHS = ['/login']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading } = useAuthStore()
  const { isPending } = authClient.useSession()

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
