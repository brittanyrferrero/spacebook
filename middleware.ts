import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

async function resolveWorkspaceToken(): Promise<string | null> {
  if (process.env.WORKSPACE_TOKEN) return process.env.WORKSPACE_TOKEN
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null
  try {
    const res = await fetch(`${process.env.KV_REST_API_URL}/get/cfg:workspace_token`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    })
    const j = await res.json() as { result?: string }
    return j.result ?? null
  } catch { return null }
}

export async function middleware(request: NextRequest) {
  // Assign or forward session ID via request header so route handlers can read it
  const existingSession = request.cookies.get('sb_session')?.value
  const sessionId = existingSession ?? crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-sb-session', sessionId)

  function pass() {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    if (!existingSession) {
      response.cookies.set('sb_session', sessionId, { maxAge: 60 * 60 * 2, path: '/', httpOnly: true, sameSite: 'lax' })
    }
    return response
  }

  const { pathname, searchParams } = request.nextUrl

  // Admin entry always bypasses all auth — check first before anything else
  if (pathname.startsWith('/admin-enter') || pathname.startsWith('/api/admin-enter')) {
    return pass()
  }

  // Admin cookie grants full access to everything (admins are workspace members too)
  if (request.cookies.get('admin_access')?.value) return pass()

  // Non-admin /admin routes require the cookie in prod
  if (process.env.MOCK_MODE !== 'true' &&
      (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) &&
      pathname !== '/api/admin/admins') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Always allow: the entry route, cancel links, demo routes
  if (pathname === '/enter' || pathname.startsWith('/enter/') ||
      pathname.startsWith('/cancel/') || pathname.startsWith('/api/cancel/') ||
      pathname.startsWith('/api/bookings/by-token/') ||
      pathname.startsWith('/api/members') ||
      pathname.startsWith('/api/enter-check') ||
      pathname.startsWith('/api/enter-set-cookie') ||
      pathname === '/landing' ||
      pathname.startsWith('/api/notify') ||
      pathname.startsWith('/demo-admin') ||
      pathname === '/demo' ||
      pathname.startsWith('/api/demo-access') ||
      pathname.startsWith('/api/settings')) {
    return pass()
  }

  // Workspace token check — resolve lazily (may hit KV if no env var set)
  const token = await resolveWorkspaceToken()

  // Root without valid access → redirect to appropriate landing
  if (pathname === '/') {
    if (!token || request.cookies.get('ws_access')?.value !== token) {
      const dest = process.env.MOCK_MODE === 'true' ? '/demo' : '/enter'
      return NextResponse.redirect(new URL(dest, request.url))
    }
  }

  // No token configured, or running locally → open access
  if (!token || process.env.NODE_ENV === 'development') return pass()

  // Valid cookie → let through
  if (request.cookies.get('ws_access')?.value === token) return pass()

  // No valid cookie → redirect to the "you need the link" page
  return NextResponse.redirect(new URL('/enter', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
