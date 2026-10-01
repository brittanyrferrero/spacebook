import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  signCookieValue, readAdminRole, readPalantirSession, setAdminCookie, setPalantirCookie,
} from '@/lib/auth-cookies'

// Regression tests for #163: admin_{slug} and palantir_session used to be
// accepted on presence alone, so any HTTP client could forge them.

function jar(entries: Record<string, string>) {
  return { get: (name: string) => (name in entries ? { value: entries[name] } : undefined) }
}

function writer() {
  const set: Record<string, string> = {}
  return { set: (name: string, value: string) => { set[name] = value }, values: set }
}

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-secret')
  vi.stubEnv('PALANTIR_ADMINS', 'boss@example.com, other@example.com')
})
afterEach(() => vi.unstubAllEnvs())

describe('admin_{slug}', () => {
  it('accepts a cookie the server signed', async () => {
    const w = writer()
    await setAdminCookie(w, 'swift-cedar', 'super_admin')
    expect(await readAdminRole(jar(w.values), 'swift-cedar')).toBe('super_admin')
  })

  it('rejects the old forgeable plain role string', async () => {
    expect(await readAdminRole(jar({ 'admin_swift-cedar': 'super_admin' }), 'swift-cedar')).toBeNull()
  })

  it('rejects a cookie signed for a different workspace', async () => {
    const w = writer()
    await setAdminCookie(w, 'workspace-a', 'super_admin')
    expect(await readAdminRole(jar({ 'admin_workspace-b': w.values['admin_workspace-a'] }), 'workspace-b')).toBeNull()
  })

  it('rejects a tampered role', async () => {
    const w = writer()
    await setAdminCookie(w, 'swift-cedar', 'admin')
    const [, exp, sig] = w.values['admin_swift-cedar'].split('.')
    const forgedValue = Buffer.from('super_admin').toString('base64url')
    expect(await readAdminRole(jar({ 'admin_swift-cedar': `${forgedValue}.${exp}.${sig}` }), 'swift-cedar')).toBeNull()
  })

  it('rejects an extended expiry', async () => {
    const w = writer()
    await setAdminCookie(w, 'swift-cedar', 'admin')
    const [value, exp, sig] = w.values['admin_swift-cedar'].split('.')
    expect(await readAdminRole(jar({ 'admin_swift-cedar': `${value}.${Number(exp) + 999999}.${sig}` }), 'swift-cedar')).toBeNull()
  })

  it('rejects an expired cookie', async () => {
    const raw = await signCookieValue('admin', 'swift-cedar', 'admin', -10)
    expect(await readAdminRole(jar({ 'admin_swift-cedar': raw }), 'swift-cedar')).toBeNull()
  })

  it('rejects a cookie signed with a different secret', async () => {
    const w = writer()
    await setAdminCookie(w, 'swift-cedar', 'admin')
    vi.stubEnv('SESSION_SECRET', 'rotated-secret')
    expect(await readAdminRole(jar(w.values), 'swift-cedar')).toBeNull()
  })
})

describe('palantir_session', () => {
  it('accepts a signed session for a current Palantir admin', async () => {
    const w = writer()
    await setPalantirCookie(w, 'boss@example.com')
    expect(await readPalantirSession(jar(w.values))).toBe('boss@example.com')
  })

  it('rejects any unsigned value', async () => {
    expect(await readPalantirSession(jar({ palantir_session: 'x' }))).toBeNull()
    expect(await readPalantirSession(jar({ palantir_session: 'boss@example.com' }))).toBeNull()
  })

  it('rejects an admin cookie passed off as a Palantir session', async () => {
    const raw = await signCookieValue('admin', 'boss@example.com', 'boss@example.com', 3600)
    expect(await readPalantirSession(jar({ palantir_session: raw }))).toBeNull()
  })

  it('rejects someone removed from PALANTIR_ADMINS, even with a valid signature', async () => {
    const w = writer()
    await setPalantirCookie(w, 'other@example.com')
    vi.stubEnv('PALANTIR_ADMINS', 'boss@example.com')
    expect(await readPalantirSession(jar(w.values))).toBeNull()
  })
})

describe('missing SESSION_SECRET in production', () => {
  it('fails closed', async () => {
    const w = writer()
    await setAdminCookie(w, 'swift-cedar', 'super_admin')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MOCK_MODE', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await readAdminRole(jar(w.values), 'swift-cedar')).toBeNull()
  })

  it('fails closed in mock mode too — the dev secret is public in the repo', async () => {
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MOCK_MODE', 'true')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const forgedWithDevSecret = await (async () => {
      vi.stubEnv('NODE_ENV', 'development')
      const raw = await signCookieValue('palantir', '-', 'boss@example.com', 3600)
      vi.stubEnv('NODE_ENV', 'production')
      return raw
    })()
    expect(await readPalantirSession(jar({ palantir_session: forgedWithDevSecret }))).toBeNull()
  })
})

describe('middleware', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MOCK_MODE', '')
    vi.stubEnv('NEXT_PUBLIC_MOCK_MODE', '')
  })

  async function hit(path: string, cookie?: string) {
    const { middleware } = await import('@/middleware')
    return middleware(new NextRequest(`https://example.com${path}`, { headers: cookie ? { cookie } : {} }))
  }

  it('redirects a forged palantir_session to the entry page', async () => {
    const res = await hit('/swift-cedar/book', 'palantir_session=x')
    expect(res.headers.get('location')).toContain('/enter/swift-cedar')
  })

  it('redirects a forged admin cookie to the entry page', async () => {
    const res = await hit('/swift-cedar/book', 'admin_swift-cedar=super_admin')
    expect(res.headers.get('location')).toContain('/enter/swift-cedar')
  })

  it('lets a signed Palantir session through', async () => {
    const w = writer()
    await setPalantirCookie(w, 'boss@example.com')
    const res = await hit('/swift-cedar/book', `palantir_session=${w.values.palantir_session}`)
    expect(res.headers.get('location')).toBeNull()
  })
})
