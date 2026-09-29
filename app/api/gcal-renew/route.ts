import { type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { appUrl, sendGcalSyncHealthEmail } from '@/lib/email'

// Vercel cron: runs daily at 2am UTC to renew expiring GCal webhooks
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { getAllWatchedRooms, getWatchState, saveWatchState } = await import('@/lib/google-calendar/watchStore')
  const { getTokens, saveTokens } = await import('@/lib/google-calendar/tokenStore')

  const roomIds = await getAllWatchedRooms()
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000
  let renewed = 0, errors = 0
  const failedRoomIds = new Set<string>()

  for (const roomId of roomIds) {
    const watchState = await getWatchState(roomId)
    if (!watchState) continue
    if (watchState.expirationMs - Date.now() > TWO_DAYS_MS) continue

    try {
      const tokens = await getTokens(roomId)
      if (!tokens) {
        // Don't delete watch state here: a falsy result can't distinguish "tokens
        // were genuinely revoked" from a transient KV/network hiccup, and this path
        // runs for every watch on the same day whenever they were all registered
        // together (e.g. via the fast-path re-register), so a single bad read wipes
        // every room in a workspace at once. Real disconnects already clean up their
        // own watch state (see gcal/disconnect route) — just skip and report.
        console.error('[gcal renew] no tokens found for room with an active watch — skipping renewal, not deleting watch state', { roomId })
        errors++
        failedRoomIds.add(roomId)
        continue
      }

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
      failedRoomIds.add(roomId)
    }
  }

  const unhealthy = await checkSyncHealth(failedRoomIds)
  if (unhealthy.length > 0) await notifyUnhealthy(unhealthy)

  return Response.json({ renewed, errors, total: roomIds.length, unhealthyRooms: unhealthy.length })
}

// Cross-checks every GCal-connected room against its watch state — catches the
// class of failure that renewal itself can't see: a room the app thinks is
// connected but that never had a watch registered (or lost it) in the first
// place, so it was never in `roomIds` above at all. This is what let a real
// outage (plonk-mango-wizard, since ~2026-08-25) go unnoticed for three weeks —
// see docs/runbooks/gcal-not-syncing.md.
async function checkSyncHealth(failedRoomIds: Set<string>) {
  const { getWatchState } = await import('@/lib/google-calendar/watchStore')
  const { hasTokens } = await import('@/lib/google-calendar/tokenStore')
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, is_active, google_calendar_id, workspace_id, workspaces(slug, name)')
    .not('google_calendar_id', 'is', null)
  if (!rooms) return []

  const unhealthy: { roomName: string; workspaceSlug: string; workspaceName: string | null; reason: string }[] = []

  for (const room of rooms as any[]) {
    if (!room.is_active) continue // disabled rooms deliberately don't sync — not a health issue

    // `rooms.google_calendar_id` is never cleared on disconnect (see
    // app/api/[workspace]/gcal/disconnect/[roomId]/route.ts) — it only removes
    // tokens and watch state. So a room that was legitimately disconnected, or
    // never finished connecting, still has google_calendar_id set. Only a room
    // with live tokens is actually expected to have an active watch; check the
    // same thing the app's own "gcal_connected" indicator checks, not just
    // whether a calendar was ever picked.
    if (!(await hasTokens(room.id))) continue

    const workspaceSlug = room.workspaces?.slug ?? 'unknown'
    const workspaceName = room.workspaces?.name ?? null

    if (failedRoomIds.has(room.id)) {
      unhealthy.push({ roomName: room.name, workspaceSlug, workspaceName, reason: 'watch-channel renewal failed today (see [gcal renew] logs)' })
      continue
    }
    const watchState = await getWatchState(room.id)
    if (!watchState) {
      unhealthy.push({ roomName: room.name, workspaceSlug, workspaceName, reason: 'no watch channel registered — sync was never set up or was lost' })
    } else if (watchState.expirationMs < Date.now()) {
      unhealthy.push({ roomName: room.name, workspaceSlug, workspaceName, reason: 'watch channel expired and was not renewed' })
    }
  }

  return unhealthy
}

async function notifyUnhealthy(rooms: { roomName: string; workspaceSlug: string; workspaceName: string | null; reason: string }[]) {
  const admins = (process.env.PALANTIR_ADMINS ?? '').split(',').map(e => e.trim()).filter(Boolean)
  for (const to of admins) {
    try { await sendGcalSyncHealthEmail({ to, rooms }) } catch (err) { console.error('[gcal renew] failed to send sync health email', { to, err }) }
  }
}
