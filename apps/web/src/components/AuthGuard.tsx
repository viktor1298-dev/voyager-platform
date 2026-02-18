'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { isPublicPath } from '@/lib/auth-constants'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = authClient.useSession()
  const [isHydrated, setIsHydrated] = useState(false)
  const [queryString, setQueryString] = useState('')

  const hasValidSession = useMemo(() => Boolean(session?.user), [session])
  const isSessionResolved = !isPending

  const requestedReturnUrl = useMemo(() => {
    if (!pathname) return '/'
    return queryString.length > 0 ? `${pathname}?${queryString}` : pathname
  }, [pathname, queryString])

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.location.search
    setQueryString(query.startsWith('?') ? query.slice(1) : query)
  }, [pathname])

  useEffect(() => {
    if (!pathname) return
    if (isPublicPath(pathname)) return
    if (!isHydrated || !isSessionResolved || hasValidSession) return

    const returnUrl = encodeURIComponent(requestedReturnUrl)
    router.replace(`/login?returnUrl=${returnUrl}`)
  }, [hasValidSession, isHydrated, isSessionResolved, pathname, requestedReturnUrl, router])

  if (!pathname) return null
  if (isPublicPath(pathname)) return <>{children}</>

  if (!isHydrated || !isSessionResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <h1 className="text-base font-medium text-[var(--color-text-muted)]">Loading…</h1>
      </div>
    )
  }

  if (!hasValidSession) return null

  return <>{children}</>
}
