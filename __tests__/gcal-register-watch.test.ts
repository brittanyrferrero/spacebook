import { describe, it, expect, vi, beforeEach } from 'vitest'

// Google API, Redis watch store, Supabase and the event applier are all faked.
const store = new Map<string, any>()        // gcal:watch:<roomId>
const channelMap = new Map<string, string>() // gcal:channel:<id>
const stopped: string[] = []
let listPages: any[][] = []
let watchShouldFail = false
let bookings: { google_event_id: string; cancelled_at: string | null }[] = []
const applied: any[][] = []

vi.mock('@/lib/email', () => ({ appUrl: () => 'https://example.test' }))
vi.mock('@/lib/google-calendar/client', () => ({ getAuthClient: async () => ({}) }))
vi.mock('googleapis', () => ({
  google: {
    calendar: () => ({
      events: {
        list: async ({ pageToken }: { pageToken?: string }) => {
          const i = pageToken ? Number(pageToken) : 0
          const last = i === listPages.length - 1
          return { data: { items: listPages[i], nextPageToken: last ? undefined : String(i + 1), nextSyncToken: last ? 'sync-new' : undefined } }
        },
        watch: async () => {
          if (watchShouldFail) throw { response: { status: 403, data: { error: { message: 'Forbidden' } } } }
          return { data: { resourceId: 'res-new', expiration: String(Date.now() + 7 * 86400000) } }
        },
      },
      channels: { stop: async ({ requestBody }: any) => { stopped.push(requestBody.id) } },
    }),
  },
}))
vi.mock('@/lib/google-calendar/watchStore', () => ({
  getWatchState: async (id: string) => store.get(id) ?? null,
  saveWatchState: async (id: string, s: any) => { store.set(id, s); channelMap.set(s.channelId, id) },
  removeChannelMapping: async (ch: string) => { channelMap.delete(ch) },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const q: any = { select: () => q, eq: () => q, not: () => q, gt: async () => ({ data: bookings, error: null }) }
    return { from: () => q }
  },
}))
vi.mock('@/lib/google-calendar/applyEvents', () => ({
  applyCalendarEvents: async ({ events }: { events: any[] }) => {
    applied.push(events)
    return { imported: events.filter(e => e.status !== 'cancelled').length, cancelled: events.filter(e => e.status === 'cancelled').length }
  },
}))

const { registerWatch } = await import('@/lib/google-calendar/registerWatch')
const args = { roomId: 'r1', calendarId: 'cal', workspace: 'map', workspaceId: 'w1' }
const future = (h: number) => ({ dateTime: new Date(Date.now() + h * 3600000).toISOString() })

beforeEach(() => {
  store.clear(); channelMap.clear(); stopped.length = 0; applied.length = 0
  listPages = [[]]; watchShouldFail = false; bookings = []
})

describe('registerWatch replacing an existing watch', () => {
  it('keeps the old watch state if registering the new channel fails', async () => {
    const old = { channelId: 'ch-old', resourceId: 'res-old', expirationMs: 1, syncToken: 's', calendarId: 'cal', workspace: 'map', workspaceId: 'w1', roomId: 'r1' }
    store.set('r1', old); channelMap.set('ch-old', 'r1')
    watchShouldFail = true

    const result = await registerWatch(args)

    expect(result).toEqual({ ok: false, reason: 'google_error', detail: 'Forbidden' })
    expect(store.get('r1')).toBe(old)
    expect(channelMap.get('ch-old')).toBe('r1')
    expect(stopped).toEqual([])
  })

  it('saves the new watch, then stops the old channel and drops its mapping', async () => {
    store.set('r1', { channelId: 'ch-old', resourceId: 'res-old' }); channelMap.set('ch-old', 'r1')

    const result = await registerWatch(args)

    expect(result).toEqual({ ok: true })
    expect(store.get('r1').channelId).not.toBe('ch-old')
    expect(store.get('r1').syncToken).toBe('sync-new')
    expect(stopped).toEqual(['ch-old'])
    expect(channelMap.has('ch-old')).toBe(false)
    expect(channelMap.get(store.get('r1').channelId)).toBe('r1')
  })
})

describe('registerWatch catch-up', () => {
  it('does not apply anything without catchUp (first connect)', async () => {
    listPages = [[{ id: 'new', status: 'confirmed', end: future(2) }]]
    await registerWatch(args)
    expect(applied).toEqual([])
  })

  it('applies only events that differ from spacebook, across all pages', async () => {
    bookings = [
      { google_event_id: 'known', cancelled_at: null },
      { google_event_id: 'gone', cancelled_at: null },
      { google_event_id: 'already-cancelled', cancelled_at: '2026-11-01T00:00:00Z' },
    ]
    listPages = [
      [
        { id: 'known', status: 'confirmed', end: future(2) },               // already mirrored
        { id: 'new-future', status: 'confirmed', end: future(3) },          // missed → import
        { id: 'new-past', status: 'confirmed', end: future(-3) },           // already over
      ],
      [
        { id: 'gone', status: 'cancelled' },                                // missed delete → cancel
        { id: 'already-cancelled', status: 'cancelled' },                   // nothing to do
        { id: 'never-ours', status: 'cancelled' },                          // unrelated deletion
        { id: 'all-day', status: 'confirmed', end: { date: '2099-01-02' } }, // missed → import
      ],
    ]

    const result = await registerWatch(args, { catchUp: true })

    expect(applied).toHaveLength(1)
    expect(applied[0].map(e => e.id)).toEqual(['new-future', 'gone', 'all-day'])
    expect(result).toEqual({ ok: true, caughtUp: { imported: 2, cancelled: 1 } })
  })

  it('reports nothing to apply when spacebook is already in step', async () => {
    bookings = [{ google_event_id: 'known', cancelled_at: null }]
    listPages = [[{ id: 'known', status: 'confirmed', end: future(1) }]]

    const result = await registerWatch(args, { catchUp: true })

    expect(applied).toEqual([])
    expect(result).toEqual({ ok: true, caughtUp: { imported: 0, cancelled: 0 } })
  })
})
