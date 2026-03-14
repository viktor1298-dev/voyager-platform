import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { HOST_SESSION_COOKIE_NAME, isPublicPath, SESSION_COOKIE_NAME, SECURE_SESSION_COOKIE_NAME } from '@/lib/auth-constants'

function hasUsableSessionCookie(request: NextRequest): boolean {
  const candidateCookies = [
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    request.cookies.get(SECURE_SESSION_COOKIE_NAME)?.value,
    request.cookies.get(HOST_SESSION_COOKIE_NAME)?.value,
  ]

  return candidateCookies.some((value) => typeof value === 'string' && value.trim().length > 0)
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (!hasUsableSessionCookie(request)) {
    const loginUrl = new URL('/login', request.url)
    const requestedPath = `${pathname}${request.nextUrl.search}`

    if (searchParams.get('loggedOut') === '1') {
      const loggedOutAt = searchParams.get('loggedOutAt') ?? String(Date.now())
      loginUrl.searchParams.set('loggedOut', '1')
      if (loggedOutAt.trim().length > 0) {
        loginUrl.searchParams.set('loggedOutAt', loggedOutAt)
      }
    } else if (pathname === '/' && !request.nextUrl.search) {
      return NextResponse.redirect(loginUrl)
    } else if (pathname === '/clusters' && !request.nextUrl.search) {
      return NextResponse.redirect(loginUrl)
    } else {
      loginUrl.searchParams.set('returnUrl', requestedPath)
    }

    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|trpc|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
