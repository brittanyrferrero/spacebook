import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stand-ins for Supabase, the GCal client and googleapis
let bookingRows: any[] = []
let bookingQuery: Record<string, unknown> = {}
const updates: { id: string; google_event_id: string }[] = []
let existingEvents: any[] = []
const created: string[] = []
let createImpl: (b: any) => Promise<string | null>
const noAuth = new Set<string>()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table !== 'bookings') throw new Error(`unexpected table ${table}`)
      const q: any = {
        select: () => q,
        in: (c: string, v: unknown) => { bookingQuery[`in:${c}`] = v; return q },
        is: (c: string, v: unknown) => { bookingQuery[`is:${c}`] = v; return q },
        eq: (c: string, v: unknown) => { bookingQuery[`eq:${c}`] = v; return q },
        gt: (c: string, v: unknown) => { bookingQuery[`gt:${c}`] = v; return q },
        lt: (c: string, v: unknown) => { bookingQuery[`lt:${c}`] = v; return q },
        order: () => q,
        limit: async (n: number) => { bookingQuery.limit = n; return { data: bookingRows.slice(0, n), error: null } },
        update: (row: { google_event_id: string }) => ({
          eq: async (_c: string, id: string) => { updates.push({ id, google_event_id: row.google_event_id }); return { error: null } },
        }),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/google-calendar/client', () => ({
  getAuthClient: async (roomId: string) => (noAuth.has(roomId) ? null : {}),
  createCalendarEvent: async (b: any) => createImpl(b),
}))
vi.mock('googleapis', () => ({
  google: { calendar: () => ({ events: { list: async () => ({ data: { items: existingEvents } }) } }) },
}))

const { resyncMissingEvents, MAX_PER_RUN } = await import('@/lib/google-calendar/resyncMissingEvents')

const room = (id: string) => ({ id, name: `Room ${id}`, google_calendar_id: `${id}@cal`, gcal_resource_email: null, workspaceSlug: 'map', workspaceName: 'MAP' })
const booking = (id: string, roomId = 'r1') => ({
  id, room_id: roomId, booker_name: 'Ada', booker_email: 'ada@example.com', title: 'Sync',
  start_time: '2026-11-10T17:00:00.000Z', end_time: '2026-11-10T18:00:00.000Z',
})

beforeEach(() => {
  bookingRows = []; bookingQuery = {}; updates.length = 0; existingEvents = []; created.length = 0; noAuth.clear()
  createImpl = async b => { created.push(b.id); return `evt-${b.id}` }
})

describe('resyncMissingEvents', () => {
  it('only looks at upcoming, unsynced, uncancelled, non-block bookings old enough to not race the create-time write', async () => {
    await resyncMissingEvents([room('r1'), room('r2')])
    expect(bookingQuery['in:room_id']).toEqual(['r1', 'r2'])
    expect(bookingQuery['is:google_event_id']).toBeNull()
    expect(bookingQuery['is:cancelled_at']).toBeNull()
    expect(bookingQuery['eq:is_block']).toBe(false)
    expect(Date.parse(bookingQuery['gt:end_time'] as string)).toBeLessThanOrEqual(Date.now())
    expect(Date.now() - Date.parse(bookingQuery['lt:created_at'] as string)).toBeGreaterThanOrEqual(15 * 60 * 1000)
  })

  it('creates the missing event and saves its id', async () => {
    bookingRows = [booking('b1'), booking('b2', 'r2')]
    const r = await resyncMissingEvents([room('r1'), room('r2')])
    expect(created).toEqual(['b1', 'b2'])
    expect(updates).toEqual([{ id: 'b1', google_event_id: 'evt-b1' }, { id: 'b2', google_event_id: 'evt-b2' }])
    expect(r.added).toBe(2)
    expect(r.fixed.map(f => [f.roomName, f.count])).toEqual([['Room r1', 1], ['Room r2', 1]])
    expect(r.failures).toEqual([])
  })

  it('adopts an event that already exists instead of creating a duplicate', async () => {
    bookingRows = [booking('b1')]
    existingEvents = [
      { id: 'other', status: 'confirmed', description: 'Booked by Someone (x@example.com)', start: { dateTime: '2026-11-10T17:00:00Z' }, end: { dateTime: '2026-11-10T18:00:00Z' } },
      { id: 'mine', status: 'confirmed', description: 'Booked by Ada (ada@example.com)', start: { dateTime: '2026-11-10T09:00:00-08:00' }, end: { dateTime: '2026-11-10T10:00:00-08:00' } },
    ]
    const r = await resyncMissingEvents([room('r1')])
    expect(created).toEqual([])
    expect(updates).toEqual([{ id: 'b1', google_event_id: 'mine' }])
    expect(r.adopted).toBe(1)
  })

  it('reports failures per room with the first error, and keeps going', async () => {
    bookingRows = [booking('b1'), booking('b2'), booking('b3', 'r2')]
    createImpl = async b => { if (b.room_id === 'r1') throw new Error('Forbidden'); created.push(b.id); return `evt-${b.id}` }
    const r = await resyncMissingEvents([room('r1'), room('r2')])
    expect(r.failures).toEqual([{ roomName: 'Room r1', workspaceSlug: 'map', workspaceName: 'MAP', count: 2, error: 'Forbidden' }])
    expect(created).toEqual(['b3'])
  })

  it('flags a room whose tokens are missing', async () => {
    bookingRows = [booking('b1')]
    noAuth.add('r1')
    const r = await resyncMissingEvents([room('r1')])
    expect(r.failures[0].error).toBe('no Google tokens for this room')
    expect(updates).toEqual([])
  })

  it('caps one run and says there is a backlog', async () => {
    bookingRows = Array.from({ length: MAX_PER_RUN + 5 }, (_, i) => booking(`b${i}`))
    const r = await resyncMissingEvents([room('r1')])
    expect(created).toHaveLength(MAX_PER_RUN)
    expect(r.backlog).toBe(true)
  })

  it('does nothing without connected rooms', async () => {
    const r = await resyncMissingEvents([])
    expect(r).toEqual({ added: 0, adopted: 0, fixed: [], failures: [], backlog: false })
    expect(bookingQuery).toEqual({})
  })
})
