import { type NextRequest, NextResponse } from 'next/server'

// Forwards to the fixed non-workspace-scoped callback handler.
// This route is kept so any old bookmarked/cached links still work.
export async function GET(req: NextRequest) {
  const fixed = new URL('/api/gcal/callback', req.url)
  fixed.search = req.nextUrl.search
  return NextResponse.redirect(fixed)
}
