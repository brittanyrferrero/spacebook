import { google } from 'googleapis'
import { appUrl } from '@/lib/email'
import { getAuthClient } from './client'

export type RegisterWatchResult =
  | { ok: true }
  | { ok: false; reason: 'not_connected' | 'no_sync_token' | 'google_error'; detail?: string }

// Registers a fresh push-notification channel for a room's calendar using the
// room's existing OAuth tokens, replacing any watch already stored. Shared by
// the admin "pick calendar" flow (POST /gcal/watch) and the daily cron's
// self-heal in /api/gcal-renew.
export async function registerWatch(args: { roomId: string; calendarId: string; workspace: string; workspaceId: string }): Promise<RegisterWatchResult> {
  const { roomId, calendarId, workspace, workspaceId } = args
  const auth = await getAuthClient(roomId)
  if (!auth) return { ok: false, reason: 'not_connected' }

  const calendar = google.calendar({ version: 'v3', auth })
  const { saveWatchState, getWatchState, removeWatchState } = await import('./watchStore')

  // Stop any existing watch for this room
  const existing = await getWatchState(roomId)
  if (existing) {
    try { await calendar.channels.stop({ requestBody: { id: existing.channelId, resourceId: existing.resourceId } }) } catch { /* non-fatal */ }
    await removeWatchState(roomId, existing.channelId)
  }

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
    return { ok: true }
  } catch (err: any) {
    console.error('[gcal watch] failed to register watch channel', {
      roomId,
      workspace,
      status: err?.response?.status,
      googleError: err?.response?.data ?? err?.message,
    })
    return { ok: false, reason: 'google_error', detail: err?.response?.data?.error?.message ?? err?.message }
  }
}
