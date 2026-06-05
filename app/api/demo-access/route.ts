import { NextResponse } from 'next/server'

// Called from the landing page to grant a visitor access to the demo workspace.
// Sets ws_access (matched against WORKSPACE_TOKEN in the demo deployment) so
// middleware allows the visitor through to /swift-cedar-lake.
//
// No admin cookie is set here — real admin access requires a valid
// admin_entry_token and is granted via POST /api/[workspace]/admin-enter,
// which sets admin_{slug} (workspace-scoped). The old admin_auth=true cookie
// that previously appeared here was unused by middleware and all API routes
// (they check admin_{slug}, not admin_auth) and has been removed. See #59.
export async function GET() {
  const res = NextResponse.json({ ok: true })
  const token = process.env.WORKSPACE_TOKEN
  if (token) {
    res.cookies.set('ws_access', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
  }
  return res
}
