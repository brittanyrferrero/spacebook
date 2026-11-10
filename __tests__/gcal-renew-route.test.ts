import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-ins for watch/token stores, Supabase, registration and email
const watches = new Map<string, { expirationMs: number }>()
const tokens = new Set<string>()
const registerResults = new Map<string, { ok: true } | { ok: false; reason: string; detail?: string }>()
const registered: string[] = []
const sent: { to: string; rooms: { roomName: string; reason: string }[]; healed: { roomName: string; reason: string }[] }[] = []

vi.mock('@/lib/google-calendar/watchStore', () => ({
  getAllWatchedRooms: async () => [],
  getWatchState: async (id: string) => watches.get(id) ?? null,
  saveWatchState: async () => {},
  removeWatchState: async () => {},
}))
vi.mock('@/lib/google-calendar/tokenStore', () => ({
  getTokens: async () => null,
  saveTokens: async () => {},
  hasTokens: async (id: string) => tokens.has(id),
}))
vi.mock('@/lib/google-calendar/registerWatch', () => ({
  registerWatch: async ({ roomId }: { roomId: string }) => {
    registered.push(roomId)
    return registerResults.get(roomId) ?? { ok: true }
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        not: async () => ({
          data: ['r1', 'r2', 'r3', 'r4'].map(id => ({
            id, name: `Room ${id}`, is_active: true, google_calendar_id: `${id}@cal`, workspace_id: 'w1', workspaces: { slug: 'map', name: 'MAP' },
          })),
        }),
      }),
    }),
  }),
}))
const resyncCalls: string[][] = []
let resyncResult: any
vi.mock('@/lib/google-calendar/resyncMissingEvents', () => ({
  resyncMissingEvents: async (rooms: { id: string }[]) => {
    resyncCalls.push(rooms.map(r => r.id))
    return resyncResult
  },
}))
vi.mock('@/lib/email', () => ({
  appUrl: () => 'https://example.test',
  sendGcalSyncHealthEmail: async (args: any) => { sent.push(args) },
}))

const { GET } = await import('@/app/api/gcal-renew/route')
const call = () => GET(new Request('https://example.test/api/gcal-renew') as any)

beforeEach(() => {
  watches.clear(); tokens.clear(); registerResults.clear()
  registered.length = 0; sent.length = 0; resyncCalls.length = 0
  resyncResult = { added: 0, adopted: 0, fixed: [], failures: [], backlog: false }
  process.env.PALANTIR_ADMINS = 'admin@x.org'
  delete process.env.CRON_SECRET
})

describe('gcal-renew sync health self-heal', () => {
  it('re-registers missing and expired watches and reports them as fixed, not broken', async () => {
    tokens.add('r1'); tokens.add('r2'); tokens.add('r3')
    watches.set('r2', { expirationMs: Date.now() - 1000 })     // expired
    watches.set('r3', { expirationMs: Date.now() + 86400000 }) // healthy
    // r4 has no tokens — not connected, left alone

    const body = await (await call()).json()

    expect(registered.sort()).toEqual(['r1', 'r2'])
    expect(body.healedRooms).toBe(2)
    expect(body.unhealthyRooms).toBe(0)
    expect(sent).toHaveLength(1)
    expect(sent[0].rooms).toEqual([])
    expect(sent[0].healed.map(r => [r.roomName, r.reason])).toEqual([
      ['Room r1', 'no watch channel registered'],
      ['Room r2', 'watch channel expired'],
    ])
  })

  it('sends nothing when every connected room is healthy', async () => {
    tokens.add('r1')
    watches.set('r1', { expirationMs: Date.now() + 86400000 })

    await call()

    expect(registered).toEqual([])
    expect(sent).toHaveLength(0)
  })

  it('emails only the rooms whose re-registration failed, with the failure detail', async () => {
    tokens.add('r1'); tokens.add('r2')
    registerResults.set('r2', { ok: false, reason: 'google_error', detail: 'Not Found' })

    const body = await (await call()).json()

    expect(body.healedRooms).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].rooms.map(r => r.roomName)).toEqual(['Room r2'])
    expect(sent[0].rooms[0].reason).toContain('auto re-register failed: Not Found')
    expect(sent[0].healed.map(r => r.roomName)).toEqual(['Room r1'])
  })
})

describe('gcal-renew outbound resync', () => {
  it('only resyncs active rooms with live tokens', async () => {
    tokens.add('r1'); tokens.add('r3')
    await call()
    expect(resyncCalls).toEqual([['r1', 'r3']])
  })

  it('reports bookings it added as fixed and ones it could not add as broken', async () => {
    tokens.add('r1'); tokens.add('r2')
    watches.set('r1', { expirationMs: Date.now() + 86400000 })
    watches.set('r2', { expirationMs: Date.now() + 86400000 })
    resyncResult = {
      added: 3, adopted: 0, backlog: false,
      fixed: [{ roomName: 'Room r1', workspaceSlug: 'map', workspaceName: 'MAP', count: 3 }],
      failures: [{ roomName: 'Room r2', workspaceSlug: 'map', workspaceName: 'MAP', count: 1, error: 'Forbidden' }],
    }

    const body = await (await call()).json()

    expect(body.resyncedBookings).toBe(3)
    expect(body.resyncFailedRooms).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].healed.map(r => [r.roomName, r.reason])).toEqual([['Room r1', '3 upcoming bookings missing from Google Calendar — added']])
    expect(sent[0].rooms.map(r => [r.roomName, r.reason])).toEqual([['Room r2', "1 upcoming booking not on Google Calendar and couldn't be added (Forbidden)"]])
  })
})
