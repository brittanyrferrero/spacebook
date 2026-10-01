import { type NextRequest } from 'next/server'
import { readPalantirSession } from '@/lib/auth-cookies'

// Global (non-workspace-scoped) disconnect, called only from the Palantir
// super-admin panel (app/admin/page.tsx) — gated on the same palantir_session
// cookie every other app/api/palantir/* route requires.
export async function DELETE(req: NextRequest, { params }: { params: { roomId: string } }) {
  if (!await readPalantirSession(req.cookies)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { removeTokens } = await import('@/lib/google-calendar/tokenStore')
  await removeTokens(params.roomId)
  return Response.json({ disconnected: true })
}
