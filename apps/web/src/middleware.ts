import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isPublicPath, SESSION_COOKIE_NAME, SECURE_SESSION_COOKIE_NAME } from '@/lib/auth-constants'

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const sessionCookie =
    request.cookies.get(SESSION_COOKIE_NAME)?.value ??
    request.cookies.get(SECURE_SESSION_COOKIE_NAME)?.value

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('returnUrl', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api|trpc).*)'],
}
