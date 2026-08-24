import { type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { getWorkspaceId } from '@/lib/workspace'
import { appUrl } from '@/lib/email'

async function buildOAuthClient(roomId: string) {
  const { getTokens, saveTokens } = await import('@/lib/google-calendar/tokenStore')
  const tokens = await getTokens(roomId)
  if (!tokens) return null
  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry ? new Date(tokens.expiry).getTime() : undefined,
  })
  oauth2Client.on('tokens', async (t) => {
    await saveTokens(roomId, { refresh_token: tokens.refresh_token, access_token: t.access_token ?? undefined, expiry: t.expiry_date ? new Date(t.expiry_date).toISOString() : undefined })
  })
  return oauth2Client
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { room_id } = await req.json()
  if (!room_id) return Response.json({ error: 'room_id required' }, { status: 400 })

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: room } = await supabase.from('rooms').select('google_calendar_id').eq('id', room_id).eq('workspace_id', workspaceId).single()
  if (!room?.google_calendar_id) return Response.json({ error: 'No calendar linked' }, { status: 400 })

  const auth = await buildOAuthClient(room_id)
  if (!auth) return Response.json({ error: 'Not connected' }, { status: 401 })

  const calendar = google.calendar({ version: 'v3', auth })
  const { saveWatchState, getWatchState, removeWatchState } = await import('@/lib/google-calendar/watchStore')

  // Stop any existing watch for this room
  const existing = await getWatchState(room_id)
  if (existing) {
    try { await calendar.channels.stop({ requestBody: { id: existing.channelId, resourceId: existing.resourceId } }) } catch { /* non-fatal */ }
    await removeWatchState(room_id, existing.channelId)
  }

  try {
    // Get initial sync token (start from now so we only process future changes)
    const listResult = await calendar.events.list({
      calendarId: room.google_calendar_id,
      maxResults: 1,
      showDeleted: true,
      singleEvents: true,
      orderBy: 'updated',
    })
    const syncToken = listResult.data.nextSyncToken
    if (!syncToken) return Response.json({ error: 'Could not get sync token' }, { status: 500 })

    const channelId = `${params.workspace}-${room_id}-${Date.now()}`
    const webhookToken = crypto.randomUUID()
    const watchResult = await calendar.events.watch({
      calendarId: room.google_calendar_id,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: `${appUrl()}/api/${params.workspace}/gcal/webhook`,
        token: webhookToken,
      },
    })

    await saveWatchState(room_id, {
      channelId,
      resourceId: watchResult.data.resourceId!,
      expirationMs: Number(watchResult.data.expiration),
      syncToken,
      calendarId: room.google_calendar_id,
      workspace: params.workspace,
      workspaceId,
      roomId: room_id,
      webhookToken,
    })

    return Response.json({ ok: true })
  } catch (err: any) {
    console.error('[gcal watch] failed to register watch channel', {
      roomId: room_id,
      workspace: params.workspace,
      status: err?.response?.status,
      googleError: err?.response?.data ?? err?.message,
    })
    return Response.json({ error: 'Could not register calendar watch', detail: err?.response?.data?.error?.message ?? err?.message }, { status: 500 })
  }
}
