import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'voyager-dev-jwt-secret-change-in-production'
)

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('voyager-token')?.value
  if (!token && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (token) {
    try {
      await jwtVerify(token, JWT_SECRET)
    } catch {
      // Token invalid/expired — clear and redirect
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('voyager-token')
      return response
    }
  }
}

export const config = { matcher: ['/((?!login|_next|favicon|api|trpc).*)'] }
