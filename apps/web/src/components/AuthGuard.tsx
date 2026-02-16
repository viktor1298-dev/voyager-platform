'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { authClient } from '@/lib/auth-client'

const PUBLIC_PATHS = ['/login']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!pathname) return
    if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/auth/')) return

    if (!isPending && !session) {
      const returnUrl = encodeURIComponent(pathname)
      router.replace(`/login?returnUrl=${returnUrl}`)
    }
  }, [isPending, pathname, router, session])

  if (!pathname) return null
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/auth/')) return <>{children}</>
  if (isPending) return null
  if (!session) return null

  return <>{children}</>
}
