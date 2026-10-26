import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getAllWatchedRooms = vi.fn()
const getWatchState = vi.fn()
const saveWatchState = vi.fn()
const removeWatchState = vi.fn()
const getTokens = vi.fn()
const saveTokens = vi.fn()
const hasTokens = vi.fn()

vi.mock('@/lib/google-calendar/watchStore', () => ({
  getAllWatchedRooms: (...args: unknown[]) => getAllWatchedRooms(...args),
  getWatchState: (...args: unknown[]) => getWatchState(...args),
  saveWatchState: (...args: unknown[]) => saveWatchState(...args),
  removeWatchState: (...args: unknown[]) => removeWatchState(...args),
}))

vi.mock('@/lib/google-calendar/tokenStore', () => ({
  getTokens: (...args: unknown[]) => getTokens(...args),
  saveTokens: (...args: unknown[]) => saveTokens(...args),
  hasTokens: (...args: unknown[]) => hasTokens(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        not: async () => ({ data: [] }),
      }),
    }),
  }),
}))

vi.mock('@/lib/email', () => ({
  appUrl: () => 'http://localhost:3000',
  sendGcalSyncHealthEmail: vi.fn(),
}))

describe('GET /api/gcal-renew — token-fetch miss during renewal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CRON_SECRET
  })

  it('does not delete watch state when a room due for renewal has no tokens', async () => {
    // Regression test for ADR-019: a falsy getTokens() result used to trigger
    // an immediate removeWatchState() call, with no way to tell a genuine
    // revoke from a transient read failure. Since a batch of rooms fixed
    // together (e.g. via the gcal-not-syncing.md fast path) also expires
    // together, one bad read here could wipe an entire workspace at once.
    getAllWatchedRooms.mockResolvedValue(['room-1'])
    getWatchState.mockResolvedValue({
      channelId: 'chan-1',
      resourceId: 'res-1',
      expirationMs: Date.now() + 1000, // due for renewal (well within the 2-day window)
      syncToken: 'sync-1',
      calendarId: 'cal-1',
      workspace: 'plonk-mango-wizard',
      workspaceId: 'ws-1',
      roomId: 'room-1',
    })
    getTokens.mockResolvedValue(null) // the failure being reproduced

    const { GET } = await import('@/app/api/gcal-renew/route')
    const res = await GET(new NextRequest('http://localhost/api/gcal-renew'))
    const body = await res.json()

    expect(removeWatchState).not.toHaveBeenCalled()
    expect(body).toMatchObject({ renewed: 0, errors: 1, total: 1 })
  })
})
