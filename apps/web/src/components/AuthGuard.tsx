'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { isPublicPath } from '@/lib/auth-constants'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = authClient.useSession()
  const [isHydrated, setIsHydrated] = useState(false)
  const [hasAuthedSession, setHasAuthedSession] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (session) {
      setHasAuthedSession(true)
    }
  }, [session])

  useEffect(() => {
    if (!pathname) return
    if (isPublicPath(pathname)) return

    if (!isPending && !session && !hasAuthedSession) {
      const returnUrl = encodeURIComponent(pathname)
      router.replace(`/login?returnUrl=${returnUrl}`)
    }
  }, [hasAuthedSession, isPending, pathname, router, session])

  if (!pathname) return null
  if (isPublicPath(pathname)) return <>{children}</>

  if (!isHydrated || (isPending && !session && !hasAuthedSession)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <h1 className="text-base font-medium text-[var(--color-text-muted)]">Loading…</h1>
      </div>
    )
  }

  if (!session && !hasAuthedSession) return null

  return <>{children}</>
}
