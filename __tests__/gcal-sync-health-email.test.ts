import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: { subject: string; html: string }[] = []
vi.mock('resend', () => ({
  Resend: class { emails = { send: async (msg: any) => { sent.push(msg) } } },
}))

const { sendGcalSyncHealthEmail } = await import('@/lib/email')
const room = (roomName: string, reason: string) => ({ roomName, workspaceSlug: 'map', workspaceName: 'MAP', reason })

beforeEach(() => {
  sent.length = 0
  process.env.RESEND_API_KEY = 'test'
})

describe('sendGcalSyncHealthEmail', () => {
  it('leads with broken rooms and lists auto-fixed ones as secondary', async () => {
    await sendGcalSyncHealthEmail({ to: 'a@x.org', rooms: [room('NW', 'auto re-register failed')], healed: [room('SW', 'no watch channel registered')] })

    expect(sent[0].subject).toBe('spacebook: 1 room not syncing with Google Calendar')
    expect(sent[0].html).toContain('NW')
    expect(sent[0].html).toContain('Fixed automatically: 1 room')
    expect(sent[0].html.indexOf('NW')).toBeLessThan(sent[0].html.indexOf('SW'))
  })

  it('uses a non-alarming subject when everything was fixed automatically', async () => {
    await sendGcalSyncHealthEmail({ to: 'a@x.org', rooms: [], healed: [room('NW', 'x'), room('SW', 'y')] })

    expect(sent[0].subject).toBe('spacebook: Google Calendar sync restored for 2 rooms')
    expect(sent[0].html).not.toContain('Standard fix')
    expect(sent[0].html).toContain('keep showing up here')
  })
})
