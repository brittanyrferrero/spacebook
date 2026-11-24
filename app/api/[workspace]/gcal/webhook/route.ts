import { type NextRequest } from 'next/server'
import { google } from 'googleapis'

export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id')
  const resourceState = req.headers.get('x-goog-resource-state')
  const incomingToken = req.headers.get('x-goog-channel-token')

  // Always return 200 — Google stops sending if it gets repeated non-2xx responses.
  if (!channelId || resourceState === 'sync') return new Response(null, { status: 200 })

  // Verify the webhook token before processing. Look up the stored token for this
  // channel and reject (silently, with 200) if it is missing or doesn't match.
  try {
    const { getRoomIdByChannel, getWatchState } = await import('@/lib/google-calendar/watchStore')
    const roomId = await getRoomIdByChannel(channelId)
    if (roomId) {
      const watchState = await getWatchState(roomId)
      if (!watchState?.webhookToken || watchState.webhookToken !== incomingToken) {
        return new Response(null, { status: 200 })
      }
    }
  } catch { /* non-fatal — fall through and let processWebhook handle any state issues */ }

  try { await processWebhook(channelId) } catch { /* non-fatal */ }

  return new Response(null, { status: 200 })
}

async function processWebhook(channelId: string) {
  const { getRoomIdByChannel, getWatchState, saveSyncToken } = await import('@/lib/google-calendar/watchStore')
  const roomId = await getRoomIdByChannel(channelId)
  if (!roomId) return

  const watchState = await getWatchState(roomId)
  if (!watchState) return

  const { getTokens, saveTokens } = await import('@/lib/google-calendar/tokenStore')
  const tokens = await getTokens(roomId)
  if (!tokens) return

  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry ? new Date(tokens.expiry).getTime() : undefined,
  })
  oauth2Client.on('tokens', async (t) => {
    await saveTokens(roomId, { refresh_token: tokens.refresh_token, access_token: t.access_token ?? undefined, expiry: t.expiry_date ? new Date(t.expiry_date).toISOString() : undefined })
  })

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  // Fetch incremental changes via sync token
  let syncToken = watchState.syncToken
  const changed: any[] = []
  let pageToken: string | undefined

  do {
    let res: any
    try {
      res = await calendar.events.list({
        calendarId: watchState.calendarId,
        syncToken: pageToken ? undefined : syncToken,
        pageToken,
        showDeleted: true,
        singleEvents: true,
      })
    } catch (err: any) {
      if (err?.response?.status === 410) {
        // Sync token expired — reset. nextSyncToken only appears on the LAST
        // page, so page through fully before reading it (a single-page call
        // only works by coincidence, when the calendar has <=1 event).
        let freshToken: string | null | undefined
        let freshPageToken: string | undefined
        do {
          const fresh = await calendar.events.list({ calendarId: watchState.calendarId, pageToken: freshPageToken, showDeleted: true, singleEvents: true })
          freshPageToken = fresh.data.nextPageToken ?? undefined
          if (!freshPageToken) freshToken = fresh.data.nextSyncToken
        } while (freshPageToken)
        await saveSyncToken(roomId, freshToken ?? syncToken)
      }
      return
    }
    changed.push(...(res.data.items ?? []))
    pageToken = res.data.nextPageToken ?? undefined
    if (!pageToken) syncToken = res.data.nextSyncToken ?? syncToken
  } while (pageToken)

  await saveSyncToken(roomId, syncToken)

  const { applyCalendarEvents } = await import('@/lib/google-calendar/applyEvents')
  await applyCalendarEvents({ roomId, workspaceId: watchState.workspaceId, calendarId: watchState.calendarId, calendar, events: changed })
}
