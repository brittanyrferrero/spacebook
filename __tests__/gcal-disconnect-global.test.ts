import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getWatchState = vi.fn()
const removeWatchState = vi.fn()
const getTokens = vi.fn()
const removeTokens = vi.fn()

vi.mock('@/lib/google-calendar/watchStore', () => ({
  getWatchState: (...args: unknown[]) => getWatchState(...args),
  removeWatchState: (...args: unknown[]) => removeWatchState(...args),
}))

vi.mock('@/lib/google-calendar/tokenStore', () => ({
  getTokens: (...args: unknown[]) => getTokens(...args),
  removeTokens: (...args: unknown[]) => removeTokens(...args),
}))

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    calendar: () => ({ channels: { stop: vi.fn() } }),
  },
}))

function req(withSession: boolean) {
  return new NextRequest('http://localhost/api/gcal/disconnect/room-1', {
    method: 'DELETE',
    headers: withSession ? { cookie: 'palantir_session=abc' } : {},
  })
}

describe('DELETE /api/gcal/disconnect/[roomId] (Palantir)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes watch state as well as tokens', async () => {
    // Since ADR-019 the renewal cron no longer sweeps up watch state for rooms
    // without tokens, so disconnect has to clean it up itself.
    getWatchState.mockResolvedValue({ channelId: 'chan-1', resourceId: 'res-1' })
    getTokens.mockResolvedValue({ refresh_token: 'rt' })

    const { DELETE } = await import('@/app/api/gcal/disconnect/[roomId]/route')
    const res = await DELETE(req(true), { params: { roomId: 'room-1' } })

    expect(res.status).toBe(200)
    expect(removeWatchState).toHaveBeenCalledWith('room-1', 'chan-1')
    expect(removeTokens).toHaveBeenCalledWith('room-1')
  })

  it('rejects requests without a Palantir session', async () => {
    const { DELETE } = await import('@/app/api/gcal/disconnect/[roomId]/route')
    const res = await DELETE(req(false), { params: { roomId: 'room-1' } })

    expect(res.status).toBe(401)
    expect(removeWatchState).not.toHaveBeenCalled()
    expect(removeTokens).not.toHaveBeenCalled()
  })
})
