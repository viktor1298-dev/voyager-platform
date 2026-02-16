'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { authClient } from '@/lib/auth-client'
import { isPublicPath } from '@/lib/auth-constants'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!pathname) return
    if (isPublicPath(pathname)) return

    if (!isPending && !session) {
      const returnUrl = encodeURIComponent(pathname)
      router.replace(`/login?returnUrl=${returnUrl}`)
    }
  }, [isPending, pathname, router, session])

  if (!pathname) return null
  if (isPublicPath(pathname)) return <>{children}</>
  if (isPending) return null
  if (!session) return null

  return <>{children}</>
}
