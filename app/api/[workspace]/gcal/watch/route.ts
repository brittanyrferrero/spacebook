import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })

  const { room_id } = await req.json()
  if (!room_id) return Response.json({ error: 'room_id required' }, { status: 400 })

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: room } = await supabase.from('rooms').select('google_calendar_id').eq('id', room_id).eq('workspace_id', workspaceId).single()
  if (!room?.google_calendar_id) return Response.json({ error: 'No calendar linked' }, { status: 400 })

  const { registerWatch } = await import('@/lib/google-calendar/registerWatch')
  const result = await registerWatch({ roomId: room_id, calendarId: room.google_calendar_id, workspace: params.workspace, workspaceId })

  if (result.ok) return Response.json({ ok: true })
  if (result.reason === 'not_connected') return Response.json({ error: 'Not connected' }, { status: 401 })
  if (result.reason === 'no_sync_token') return Response.json({ error: 'Could not get sync token' }, { status: 500 })
  return Response.json({ error: 'Could not register calendar watch', detail: result.detail }, { status: 500 })
}
