import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'studio-auth'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /studio/login is always accessible
  if (pathname === '/studio/login') return NextResponse.next()

  // Only protect /studio and sub-paths
  if (!pathname.startsWith('/studio')) return NextResponse.next()

  // If STUDIO_PASSWORD not set, auto-pass (dev convenience)
  const password = process.env.STUDIO_PASSWORD
  if (!password) return NextResponse.next()

  // Check auth cookie
  const authed = request.cookies.get(COOKIE_NAME)?.value === 'ok'
  if (!authed) {
    const loginUrl = new URL('/studio/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/studio/:path*'],
}
