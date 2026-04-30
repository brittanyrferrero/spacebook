import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = process.env.WORKSPACE_TOKEN

  // Assign or forward session ID via request header so route handlers can read it
  const existingSession = request.cookies.get('sb_session')?.value
  const sessionId = existingSession ?? crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-sb-session', sessionId)

  // No token configured, or running locally → open access
  if (!token || process.env.NODE_ENV === 'development') {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    if (!existingSession) {
      response.cookies.set('sb_session', sessionId, { maxAge: 60 * 60 * 2, path: '/', httpOnly: true, sameSite: 'lax' })
    }
    return response
  }

  const { pathname } = request.nextUrl

  // Always allow: the entry route and cancel links (shared via email)
  if (pathname === '/enter' || pathname.startsWith('/enter/') ||
      pathname.startsWith('/cancel/') || pathname.startsWith('/api/cancel/') ||
      pathname.startsWith('/api/bookings/by-token/') ||
      pathname.startsWith('/api/members') ||
      pathname.startsWith('/api/enter-check') ||
      pathname.startsWith('/api/enter-set-cookie') ||
      pathname === '/landing' ||
      pathname.startsWith('/api/notify') ||
      pathname.startsWith('/demo-admin') ||
      pathname.startsWith('/api/demo-access')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    if (!existingSession) {
      response.cookies.set('sb_session', sessionId, { maxAge: 60 * 60 * 2, path: '/', httpOnly: true, sameSite: 'lax' })
    }
    return response
  }

  // Valid cookie → let through
  if (request.cookies.get('ws_access')?.value === token) {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    if (!existingSession) {
      response.cookies.set('sb_session', sessionId, { maxAge: 60 * 60 * 2, path: '/', httpOnly: true, sameSite: 'lax' })
    }
    return response
  }

  // No valid cookie → redirect to the "you need the link" page
  return NextResponse.redirect(new URL('/enter', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
