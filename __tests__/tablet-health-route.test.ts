import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-ins for Redis, Supabase, admins and email
const store = new Map<string, unknown>()
const sent: { to: string; kind: string; rooms: { roomName: string; detail: string }[] }[] = []

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      pipeline: () => {
        const ops: (() => unknown)[] = []
        const p = {
          hgetall: (k: string) => { ops.push(() => store.get(k) ?? null); return p },
          get: (k: string) => { ops.push(() => store.get(k) ?? null); return p },
          set: (k: string, v: unknown) => { ops.push(() => store.set(k, v)); return p },
          del: (k: string) => { ops.push(() => store.delete(k)); return p },
          exec: async () => ops.map(op => op()),
        }
        return p
      },
    }),
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: async () => ({
        data: [
          { id: 'r1', name: 'Studio', is_active: true, workspace_id: 'w1', workspaces: { slug: 'plonk', name: 'Plonk' } },
          { id: 'r2', name: 'No tablet', is_active: true, workspace_id: 'w1', workspaces: { slug: 'plonk', name: 'Plonk' } },
        ],
      }),
    }),
  }),
}))
vi.mock('@/lib/prod-config', () => ({
  getAdmins: async () => [{ email: 'boss@x.org', role: 'super_admin' }, { email: 'helper@x.org', role: 'admin' }],
}))
vi.mock('@/lib/email', () => ({
  sendTabletStatusEmail: async (args: any) => { sent.push(args) },
}))

async function runCheck() {
  const { GET } = await import('@/app/api/tablet-health/route')
  return (await GET(new Request('http://x/api/tablet-health') as any)).json()
}

describe('tablet-health cron', () => {
  beforeEach(() => { store.clear(); sent.length = 0; delete process.env.CRON_SECRET })

  it('alerts super admins once when a tablet goes quiet, then once when it returns', async () => {
    store.set('tablet:seen:w1:r1', { lastSeen: new Date(Date.now() - 20 * 60_000).toISOString(), pageStartedAt: '2026-01-01T00:00:00Z', battery: 3, charging: 0 })

    expect(await runCheck()).toMatchObject({ checked: 1, wentOffline: 1, cameBack: 0 })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: 'boss@x.org', kind: 'offline' })
    expect(sent[0].rooms[0].detail).toMatch(/ran out of power/)

    // Still offline on the next run: no repeat email
    expect(await runCheck()).toMatchObject({ checked: 1, wentOffline: 0, cameBack: 0 })
    expect(sent).toHaveLength(1)

    // Tablet comes back after a reboot
    const now = new Date().toISOString()
    store.set('tablet:seen:w1:r1', { lastSeen: now, pageStartedAt: now })
    expect(await runCheck()).toMatchObject({ checked: 1, wentOffline: 0, cameBack: 1 })
    expect(sent[1]).toMatchObject({ to: 'boss@x.org', kind: 'online' })
    expect(sent[1].rooms[0].detail).toMatch(/rebooted/)
    expect(store.has('tablet:alert:w1:r1')).toBe(false)
  })

  it('warns once when a tablet is unplugged, then once when it is charging again', async () => {
    const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    store.set('tablet:seen:w1:r1', { lastSeen: minsAgo(1), pageStartedAt: minsAgo(60), battery: 71, charging: 0, unpluggedSince: minsAgo(8) })

    expect(await runCheck()).toMatchObject({ unplugged: 1, wentOffline: 0 })
    expect(sent[0]).toMatchObject({ to: 'boss@x.org', kind: 'unplugged' })
    expect(sent[0].rooms[0].detail).toMatch(/battery for about 8 minutes.*71%/)

    expect(await runCheck()).toMatchObject({ unplugged: 0 })
    expect(sent).toHaveLength(1)

    store.set('tablet:seen:w1:r1', { lastSeen: minsAgo(1), pageStartedAt: minsAgo(60), battery: 65, charging: 1 })
    expect(await runCheck()).toMatchObject({ pluggedIn: 1 })
    expect(sent[1]).toMatchObject({ kind: 'pluggedIn' })
    expect(store.has('tablet:unplugged:w1:r1')).toBe(false)
  })

  it('gives a brief unplug a grace period', async () => {
    const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    store.set('tablet:seen:w1:r1', { lastSeen: minsAgo(1), pageStartedAt: minsAgo(60), battery: 90, charging: 0, unpluggedSince: minsAgo(2) })
    expect(await runCheck()).toMatchObject({ unplugged: 0 })
    expect(sent).toHaveLength(0)
  })

  it('sends only the back-online email when an unplugged tablet died and returned charging', async () => {
    const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    store.set('tablet:alert:w1:r1', { alertedAt: minsAgo(60), lastSeen: minsAgo(90) })
    store.set('tablet:unplugged:w1:r1', { alertedAt: minsAgo(120), lastSeen: minsAgo(120) })
    store.set('tablet:seen:w1:r1', { lastSeen: minsAgo(1), pageStartedAt: minsAgo(3), battery: 5, charging: 1 })

    expect(await runCheck()).toMatchObject({ cameBack: 1, pluggedIn: 0 })
    expect(sent.map(e => e.kind)).toEqual(['online'])
    expect(store.has('tablet:unplugged:w1:r1')).toBe(false)
  })

  it('stays quiet for healthy tablets', async () => {
    store.set('tablet:seen:w1:r1', { lastSeen: new Date().toISOString() })
    expect(await runCheck()).toMatchObject({ checked: 1, wentOffline: 0, cameBack: 0 })
    expect(sent).toHaveLength(0)
  })

  it('requires the cron secret when one is configured', async () => {
    process.env.CRON_SECRET = 's3cret'
    const { GET } = await import('@/app/api/tablet-health/route')
    const res = await GET(new Request('http://x/api/tablet-health') as any)
    expect(res.status).toBe(401)
  })
})
