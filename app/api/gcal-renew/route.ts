import { type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { appUrl } from '@/lib/email'

// Vercel cron: runs daily at 2am UTC to renew expiring GCal webhooks
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { getAllWatchedRooms, getWatchState, saveWatchState, removeWatchState } = await import('@/lib/google-calendar/watchStore')
  const { getTokens, saveTokens } = await import('@/lib/google-calendar/tokenStore')

  const roomIds = await getAllWatchedRooms()
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000
  let renewed = 0, errors = 0

  for (const roomId of roomIds) {
    const watchState = await getWatchState(roomId)
    if (!watchState) continue
    if (watchState.expirationMs - Date.now() > TWO_DAYS_MS) continue

    try {
      const tokens = await getTokens(roomId)
      if (!tokens) { await removeWatchState(roomId, watchState.channelId); continue }

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

      // Stop old channel
      try { await calendar.channels.stop({ requestBody: { id: watchState.channelId, resourceId: watchState.resourceId } }) } catch { /* non-fatal */ }

      // Register new channel
      const newChannelId = `${watchState.workspace}-${roomId}-${Date.now()}`
      const webhookToken = crypto.randomUUID()
      const watchResult = await calendar.events.watch({
        calendarId: watchState.calendarId,
        requestBody: {
          id: newChannelId,
          type: 'web_hook',
          address: `${appUrl()}/api/${watchState.workspace}/gcal/webhook`,
          token: webhookToken,
        },
      })

      await saveWatchState(roomId, {
        ...watchState,
        channelId: newChannelId,
        resourceId: watchResult.data.resourceId!,
        expirationMs: Number(watchResult.data.expiration),
        webhookToken,
      })
      renewed++
    } catch (err) {
      console.error('[gcal renew] failed to renew watch channel', { roomId, err })
      errors++
    }
  }

  return Response.json({ renewed, errors, total: roomIds.length })
}
