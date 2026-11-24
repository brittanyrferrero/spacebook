import { google } from 'googleapis'
import { appUrl } from '@/lib/email'
import { getAuthClient } from './client'
import type { ApplyResult } from './applyEvents'

export type RegisterWatchResult =
  | { ok: true; caughtUp?: ApplyResult; catchUpError?: string }
  | { ok: false; reason: 'not_connected' | 'no_sync_token' | 'google_error'; detail?: string }

// Registers a fresh push-notification channel for a room's calendar using the
// room's existing OAuth tokens, replacing any watch already stored. Shared by
// the admin "pick calendar" flow (POST /gcal/watch) and the daily cron's
// self-heal in /api/gcal-renew.
//
// `catchUp` (self-heal only): while a room's watch was lost, Google changes
// never reached us, and a fresh sync token starts from *now*, so those changes
// would be skipped for good. The full event list we page through to get the
// token is also the calendar's current state, so compare it against the room's
// bookings and apply the difference. Not used for a first connect, which
// deliberately only mirrors changes made after connecting.
export async function registerWatch(
  args: { roomId: string; calendarId: string; workspace: string; workspaceId: string },
  opts: { catchUp?: boolean } = {},
): Promise<RegisterWatchResult> {
  const { roomId, calendarId, workspace, workspaceId } = args
  const auth = await getAuthClient(roomId)
  if (!auth) return { ok: false, reason: 'not_connected' }

  const calendar = google.calendar({ version: 'v3', auth })
  const { saveWatchState, getWatchState, removeChannelMapping } = await import('./watchStore')

  // Keep the existing watch in place until the new one is saved. Deleting it
  // first meant a Google error mid-way left the room with no watch at all.
  const existing = await getWatchState(roomId)

  const events: any[] = []
  try {
    // Get initial sync token (start from now so we only process future changes).
    // Google only includes nextSyncToken on the LAST page of results, so we have
    // to page through everything before we can read it off — a single-page
    // maxResults:1 call only works by coincidence, when the calendar has <=1 event.
    let syncToken: string | null | undefined
    let pageToken: string | undefined
    do {
      const listResult = await calendar.events.list({
        calendarId,
        pageToken,
        showDeleted: true,
        singleEvents: true,
      })
      if (opts.catchUp) events.push(...(listResult.data.items ?? []))
      pageToken = listResult.data.nextPageToken ?? undefined
      if (!pageToken) syncToken = listResult.data.nextSyncToken
    } while (pageToken)
    if (!syncToken) return { ok: false, reason: 'no_sync_token' }

    const channelId = `${workspace}-${roomId}-${Date.now()}`
    const webhookToken = crypto.randomUUID()
    const watchResult = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: `${appUrl()}/api/${workspace}/gcal/webhook`,
        token: webhookToken,
      },
    })

    await saveWatchState(roomId, {
      channelId,
      resourceId: watchResult.data.resourceId!,
      expirationMs: Number(watchResult.data.expiration),
      syncToken,
      calendarId,
      workspace,
      workspaceId,
      roomId,
      webhookToken,
    })
  } catch (err: any) {
    console.error('[gcal watch] failed to register watch channel', {
      roomId,
      workspace,
      status: err?.response?.status,
      googleError: err?.response?.data ?? err?.message,
    })
    return { ok: false, reason: 'google_error', detail: err?.response?.data?.error?.message ?? err?.message }
  }

  // New watch is live — now retire the old channel. Its notifications would be
  // ignored anyway (webhook token no longer matches), so failures here are harmless.
  if (existing && existing.channelId) {
    try { await calendar.channels.stop({ requestBody: { id: existing.channelId, resourceId: existing.resourceId } }) } catch { /* non-fatal */ }
    try { await removeChannelMapping(existing.channelId) } catch { /* non-fatal */ }
  }

  if (!opts.catchUp) return { ok: true }

  // The watch is fixed either way; a catch-up failure is reported, not fatal.
  try {
    const caughtUp = await catchUpMissedChanges({ roomId, workspaceId, calendarId, calendar, events })
    return { ok: true, caughtUp }
  } catch (err: any) {
    console.error('[gcal watch] catch-up after re-register failed', { roomId, err: err?.message ?? err })
    return { ok: true, catchUpError: err?.message ?? String(err) }
  }
}

// Narrows the full calendar listing to the events that actually differ from
// spacebook, so applyCalendarEvents (one query per event) only sees real
// changes: active future events we've never seen, and cancellations of
// bookings that are still active here.
async function catchUpMissedChanges(args: {
  roomId: string
  workspaceId: string
  calendarId: string
  calendar: ReturnType<typeof google.calendar>
  events: any[]
}): Promise<ApplyResult> {
  const { roomId, workspaceId, calendarId, calendar, events } = args
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  const { data: known, error } = await supabase
    .from('bookings')
    .select('google_event_id, cancelled_at')
    .eq('room_id', roomId)
    .eq('workspace_id', workspaceId)
    .not('google_event_id', 'is', null)
    .gt('end_time', nowIso)
  if (error) throw new Error(`bookings lookup failed: ${error.message}`)

  const activeIds = new Set<string>()
  const anyIds = new Set<string>()
  for (const b of known ?? []) {
    anyIds.add(b.google_event_id)
    if (!b.cancelled_at) activeIds.add(b.google_event_id)
  }

  const nowMs = Date.now()
  const endMs = (e: any) => {
    const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : null)
    return end ? new Date(end).getTime() : NaN
  }
  const missed = events.filter(e => {
    if (!e?.id) return false
    if (e.status === 'cancelled') return activeIds.has(e.id)
    return !anyIds.has(e.id) && endMs(e) >= nowMs
  })
  if (missed.length === 0) return { imported: 0, cancelled: 0 }

  const { applyCalendarEvents } = await import('./applyEvents')
  return applyCalendarEvents({ roomId, workspaceId, calendarId, calendar, events: missed })
}
