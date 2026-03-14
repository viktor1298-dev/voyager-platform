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

    const logoutInProgress = typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem('logoutInProgress')?.trim())

    if (logoutInProgress) {
      const loginUrl = new URL('/login', window.location.origin)
      loginUrl.searchParams.set('loggedOut', '1')
      loginUrl.searchParams.set('loggedOutAt', String(Date.now()))
      router.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
      return
    }

    if (pathname === '/' && !queryString) {
      router.replace('/login')
      return
    }

    if (pathname === '/clusters' && !queryString) {
      router.replace('/login')
      return
    }

    const loginUrl = new URL('/login', window.location.origin)
    if (queryString.includes('loggedOut=1')) {
      loginUrl.searchParams.set('loggedOut', '1')
      const loggedOutAt = new URLSearchParams(queryString).get('loggedOutAt')
      if (loggedOutAt && loggedOutAt.trim().length > 0) {
        loginUrl.searchParams.set('loggedOutAt', loggedOutAt)
      }
      router.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
      return
    }

    loginUrl.searchParams.set('returnUrl', requestedReturnUrl)
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

  if (!hasValidSession) return null

  return <>{children}</>
}
