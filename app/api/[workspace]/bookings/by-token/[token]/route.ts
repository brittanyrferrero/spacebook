import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function GET(_req: NextRequest, { params }: { params: { workspace: string; token: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const { getBookingByToken } = await import('@/lib/mock/api')
    const { getSessionStore } = await import('@/lib/mock/store')
    const booking = getBookingByToken(await getSessionStore(), params.token)
    if (!booking) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(booking)
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq('cancel_token', params.token)
    .eq('workspace_id', workspaceId)
    .single()
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(data)
}
