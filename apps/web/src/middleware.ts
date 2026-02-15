import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const sessionCookie =
    request.cookies.get('better-auth.session_token')?.value ??
    request.cookies.get('__Secure-better-auth.session_token')?.value

  if (!sessionCookie && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = { matcher: ['/((?!login|_next|favicon|api|trpc).*)'] }
