// ADR-023 routes: cancel, edit (PATCH) and "ask them" requests on someone
// else's booking. The database, email, KV and Google Calendar are faked.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}))

// A chainable stand-in for the Supabase query builder: selects resolve to the
// current booking, updates are recorded and merged into it.
function fakeSupabase() {
  const chain = (pending?: Record<string, unknown>) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'in', 'gte', 'order']) q[m] = () => q
    q.update = (patch: Record<string, unknown>) => { db.updates.push(patch); return chain(patch) }
    q.single = async () => {
      if (pending && db.booking) db.booking = { ...db.booking, ...pending }
      return { data: db.booking, error: null }
    }
    q.then = (resolve: (v: unknown) => void) => {
      if (pending && db.booking) db.booking = { ...db.booking, ...pending }
      resolve({ data: db.booking ? [db.booking] : [], error: null })
    }
    return q
  }
  return { from: () => chain() }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeSupabase() }))
vi.mock('@/lib/workspace', () => ({ getWorkspaceId: async () => 'ws-1' }))
vi.mock('@/lib/time-zone', () => ({ workspaceTimeZone: async () => 'America/Los_Angeles', workspaceTimeZoneBySlug: async () => 'America/Los_Angeles' }))
vi.mock('@/lib/ratelimit', () => ({ ratelimit: () => ({ limit: async () => ({ success: true }) }), getIP: () => '1.2.3.4' }))
vi.mock('@/lib/google-calendar/client', () => ({ deleteCalendarEvent: vi.fn(async () => {}), updateCalendarEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/email', async (orig) => ({
  ...(await orig<typeof import('@/lib/email')>()),
  sendBookingCancelledNoticeEmail: vi.fn(async () => {}),
  sendBookingEditedEmail: vi.fn(async () => {}),
  sendBookingRequestEmail: vi.fn(async () => {}),
}))

const email = await import('@/lib/email')
const cancelRoute = await import('@/app/api/[workspace]/bookings/[id]/cancel/route')
const bookingRoute = await import('@/app/api/[workspace]/bookings/[id]/route')
const requestRoute = await import('@/app/api/[workspace]/bookings/[id]/request/route')

const params = { params: { workspace: 'acme', id: 'b1' } }
const hourAgo = () => new Date(Date.now() - 60 * 60_000).toISOString()
const inHours = (h: number) => new Date(Date.now() + h * 60 * 60_000).toISOString()

function req(body: unknown, cookie = '') {
  return new NextRequest('http://localhost/api/acme/bookings/b1', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie: `ws_acme=acme${cookie}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.updates = []
  db.booking = {
    id: 'b1', workspace_id: 'ws-1', room_id: 'r1', recurring_series_id: null,
    booker_name: 'Sam Lee', booker_email: 'sam@example.com', title: 'Mixdown',
    start_time: inHours(1), end_time: inHours(2), cancel_token: 'tok', google_event_id: null,
    cancelled_at: null, created_at: hourAgo(), origin: 'desktop', is_block: false,
    room: { id: 'r1', name: 'Recording Studio', google_calendar_id: null },
  }
})

describe('POST /bookings/[id]/cancel', () => {
  it('asks for a reason on someone else’s older booking', async () => {
    const res = await cancelRoute.POST(req({ scope: 'this' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('reason_required')
    expect(db.updates).toHaveLength(0)
  })

  it('"permission" needs a name', async () => {
    const res = await cancelRoute.POST(req({ reason: 'permission' }), params)
    expect(res.status).toBe(400)
    expect(db.updates).toHaveLength(0)
  })

  it('"mine" cancels and tells the booker "you cancelled"', async () => {
    const res = await cancelRoute.POST(req({ reason: 'mine' }), params)
    expect(res.status).toBe(200)
    expect(db.updates[0]).toHaveProperty('cancelled_at')
    expect(email.sendBookingCancelledNoticeEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'sam@example.com', reason: 'mine', roomName: 'Recording Studio', timeZone: 'America/Los_Angeles' }))
  })

  it('"permission" cancels and names the person in the email', async () => {
    await cancelRoute.POST(req({ reason: 'permission', actorName: 'Alex' }), params)
    expect(email.sendBookingCancelledNoticeEmail).toHaveBeenCalledWith(expect.objectContaining({ reason: 'permission', actorName: 'Alex' }))
  })

  it('a booking made in the last 5 minutes cancels with no reason and no email', async () => {
    db.booking!.created_at = new Date().toISOString()
    const res = await cancelRoute.POST(req({}), params)
    expect(res.status).toBe(200)
    expect(email.sendBookingCancelledNoticeEmail).not.toHaveBeenCalled()
  })

  it('an older walk-in needs a reason, and nobody is emailed', async () => {
    db.booking!.booker_email = 'walkin@tablet.spacebook.app'
    expect((await cancelRoute.POST(req({}), params)).status).toBe(400)
    expect(db.updates).toHaveLength(0)
    const res = await cancelRoute.POST(req({ reason: 'mine' }), params)
    expect(res.status).toBe(200)
    expect(email.sendBookingCancelledNoticeEmail).not.toHaveBeenCalled()
  })

  it('room blocks stay admin-only', async () => {
    db.booking!.is_block = true
    const res = await cancelRoute.POST(req({ reason: 'mine' }), params)
    expect(res.status).toBe(403)
  })
})

describe('PATCH /bookings/[id]', () => {
  const move = { start_time: inHours(3), end_time: inHours(4) }

  it('asks for a reason on someone else’s older booking', async () => {
    const res = await bookingRoute.PATCH(req(move), params)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('reason_required')
  })

  it('won’t let a non-owner change who the booking belongs to', async () => {
    const res = await bookingRoute.PATCH(req({ ...move, booker_email: 'me@evil.test', _reason: 'mine' }), params)
    expect(res.status).toBe(400)
    expect(db.updates).toHaveLength(0)
  })

  it('only writes allowed fields', async () => {
    await bookingRoute.PATCH(req({ ...move, cancel_token: 'x', workspace_id: 'other', _reason: 'mine' }), params)
    expect(Object.keys(db.updates[0]).sort()).toEqual(['end_time', 'start_time'])
  })

  it('"permission" saves and emails the booker with the name', async () => {
    const res = await bookingRoute.PATCH(req({ ...move, _reason: 'permission', _actor_name: 'Alex' }), params)
    expect(res.status).toBe(200)
    expect(email.sendBookingEditedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'sam@example.com', reason: 'permission', editorName: 'Alex', timeZone: 'America/Los_Angeles' }))
  })

  it('the verified owner edits freely, including their own details, with no email', async () => {
    const res = await bookingRoute.PATCH(req({ ...move, booker_name: 'Sam L.' }, '; mb_acme=sam@example.com'), params)
    expect(res.status).toBe(200)
    expect(db.updates[0]).toHaveProperty('booker_name', 'Sam L.')
    expect(email.sendBookingEditedEmail).not.toHaveBeenCalled()
  })
})

describe('POST /bookings/[id]/request', () => {
  it('needs a name and a valid email', async () => {
    expect((await requestRoute.POST(req({ email: 'jo@example.com' }), params)).status).toBe(400)
    expect((await requestRoute.POST(req({ name: 'Jo', email: 'not-an-email' }), params)).status).toBe(400)
  })

  it('emails the booker and changes nothing', async () => {
    const res = await requestRoute.POST(req({ name: 'Jo', email: 'jo@example.com', note: 'Can we swap?', kind: 'cancel' }), params)
    expect(res.status).toBe(200)
    expect(db.updates).toHaveLength(0)
    expect(email.sendBookingRequestEmail).toHaveBeenCalledWith(expect.objectContaining({
      bookerEmail: 'sam@example.com', requesterEmail: 'jo@example.com', note: 'Can we swap?', kind: 'cancel', cancelToken: 'tok',
    }))
  })

  it('caps the note length', async () => {
    await requestRoute.POST(req({ name: 'Jo', email: 'jo@example.com', note: 'x'.repeat(2000) }), params)
    expect((vi.mocked(email.sendBookingRequestEmail).mock.calls[0][0]).note).toHaveLength(500)
  })

  it('refuses walk-ins and bookings that have ended', async () => {
    db.booking!.booker_email = 'walkin@tablet.spacebook.app'
    expect((await requestRoute.POST(req({ name: 'Jo', email: 'jo@example.com' }), params)).status).toBe(400)
    db.booking!.booker_email = 'sam@example.com'
    db.booking!.end_time = hourAgo()
    expect((await requestRoute.POST(req({ name: 'Jo', email: 'jo@example.com' }), params)).status).toBe(400)
  })
})
