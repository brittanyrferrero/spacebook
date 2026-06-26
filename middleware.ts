import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Non-workspace top-level path segments
const PUBLIC_SEGMENTS = new Set(['enter', 'admin-enter', 'demo', 'demo-admin', 'landing', 'landing2', 'home', 'cancel', 'privacy', 'terms', 'generate', 'palantir', 'palantir-enter'])
// Non-workspace API sub-paths (second segment after /api/)
const PUBLIC_API_SEGMENTS = new Set(['cancel', 'workspaces', 'notify', 'demo-access', 'admin', 'palantir', 'delete-confirm', 'gcal', 'gcal-renew', 'version', 'error-report'])
// Public workspace-scoped API routes (third segment after /api/[workspace]/)
const PUBLIC_WORKSPACE_ROUTES = new Set(['admin-enter', 'admin-recover', 'enter-check', 'enter-set-cookie', 'notify', 'tablet-enter', 't', 'my-bookings-enter'])

function getWorkspaceSlug(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return null

  if (parts[0] === 'api') {
    // /api/[workspace]/...
    const second = parts[1]
    if (!second || PUBLIC_API_SEGMENTS.has(second)) return null
    // Entry/auth routes within a workspace are always public
    const route = parts[2]
    if (route && PUBLIC_WORKSPACE_ROUTES.has(route)) return null
    return second
  }

  // /[workspace]/...
  const first = parts[0]
  if (PUBLIC_SEGMENTS.has(first)) return null
  // /[workspace]/admin is allowed through so the layout can show the recovery modal
  if (parts[1] === 'admin' && parts.length === 2) return null
  return first
}

export async function middleware(request: NextRequest) {
  // Assign or forward session ID for MOCK_MODE
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

  const { pathname } = request.nextUrl

  // MOCK_MODE: redirect root to the demo workspace, open access everywhere else
  if (process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || process.env.MOCK_MODE === 'true') {
    if (pathname === '/') return NextResponse.redirect(new URL('/swift-cedar-lake', request.url))
    return pass()
  }

  // Root path: workspace creation landing (no auth needed)
  if (pathname === '/') return pass()

  // Development: open access
  if (process.env.NODE_ENV === 'development') return pass()

  // Always allow public routes (enter, admin-enter, cancel, workspaces API, etc.)
  const slug = getWorkspaceSlug(pathname)
  if (!slug) return pass()

  // Workspace route — require ws_[slug] or admin_[slug] cookie
  const wsToken = request.cookies.get(`ws_${slug}`)?.value
  const adminToken = request.cookies.get(`admin_${slug}`)?.value

  if (wsToken || adminToken) return pass()

  // No valid cookie — redirect to the entry page for this workspace
  // (But let admin-enter and enter routes through regardless)
  return NextResponse.redirect(new URL(`/enter/${slug}`, request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
