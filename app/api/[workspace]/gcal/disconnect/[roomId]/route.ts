import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function DELETE(req: NextRequest, { params }: { params: { workspace: string; roomId: string } }) {
  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })

  if (process.env.MOCK_MODE === 'true') {
    const { removeTokens } = await import('@/lib/google-calendar/tokenStore')
    await removeTokens(params.roomId)
    return Response.json({ disconnected: true })
  }

  // Verify the room belongs to this workspace before touching KV/GCal
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found.' }, { status: 404 })
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: room } = await supabase.from('rooms').select('id').eq('id', params.roomId).eq('workspace_id', workspaceId).single()
  if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 })

  const [{ removeTokens }, { getWatchState, removeWatchState }] = await Promise.all([
    import('@/lib/google-calendar/tokenStore'),
    import('@/lib/google-calendar/watchStore'),
  ])

  // Stop the GCal push watch if registered
  const watchState = await getWatchState(params.roomId)
  if (watchState) {
    try {
      const { google } = await import('googleapis')
      const { getTokens } = await import('@/lib/google-calendar/tokenStore')
      const tokens = await getTokens(params.roomId)
      if (tokens) {
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
        oauth2Client.setCredentials({ refresh_token: tokens.refresh_token })
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
        await calendar.channels.stop({ requestBody: { id: watchState.channelId, resourceId: watchState.resourceId } })
      }
    } catch { /* non-fatal */ }
    await removeWatchState(params.roomId, watchState.channelId)
  }

  await removeTokens(params.roomId)
  return Response.json({ disconnected: true })
}
