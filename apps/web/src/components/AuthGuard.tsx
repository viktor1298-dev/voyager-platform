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

    const loginUrl = new URL('/login', window.location.origin)
    const currentParams = new URLSearchParams(queryString)
    const loggedOutAt = currentParams.get('loggedOutAt')
    const logoutInProgress = typeof window !== 'undefined' && window.sessionStorage.getItem('logoutInProgress')?.trim()

    if (logoutInProgress) {
      loginUrl.searchParams.set('loggedOut', '1')
      loginUrl.searchParams.set('loggedOutAt', logoutInProgress)
      if (requestedReturnUrl !== '/login') {
        loginUrl.searchParams.set('returnUrl', requestedReturnUrl)
      }
      router.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
      return
    }

    if (currentParams.get('loggedOut') === '1') {
      loginUrl.searchParams.set('loggedOut', '1')
      if (loggedOutAt && loggedOutAt.trim().length > 0) {
        loginUrl.searchParams.set('loggedOutAt', loggedOutAt)
      }
      if (pathname !== '/login' && requestedReturnUrl !== '/login') {
        loginUrl.searchParams.set('returnUrl', requestedReturnUrl)
      }
      router.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
      return
    }

    if (pathname !== '/login') {
      loginUrl.searchParams.set('returnUrl', requestedReturnUrl)
    }
    router.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
  }, [hasValidSession, isHydrated, isSessionResolved, pathname, queryString, requestedReturnUrl, router])

  if (!pathname) return null
  if (isPublicPath(pathname)) return <>{children}</>

  if (!isHydrated || !isSessionResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <h1 className="text-base font-medium text-[var(--color-text-muted)]">Loading…</h1>
      </div>
    )
  }

  // Keep the current protected page mounted while the redirect effect runs.
  // Returning null here caused guest E2E/spec flows to lose shell affordances
  // and made auth bounces much flakier during session resolution races.
  if (!hasValidSession) {
    return <>{children}</>
  }

  return <>{children}</>
}
