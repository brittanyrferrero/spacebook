// Signed auth cookies for admin_{slug} and palantir_session — see ADR-022 and
// issue #163. These cookies used to hold a plain role string or email, and
// every check only asked "does the cookie exist?", so any HTTP client could
// send `admin_<slug>=super_admin` or `palantir_session=x` and be let in.
//
// Each value is now `base64url(value).expiry.base64url(HMAC)`, where the HMAC
// covers the cookie's kind and scope as well as the value. That means an
// admin cookie for workspace A can't be replayed as workspace B, and neither
// can be passed off as a Palantir session.
//
// Uses Web Crypto rather than node:crypto so middleware (Edge runtime) can
// verify too. ws_{slug} is deliberately NOT signed — see ADR-022.

import type { AdminRole } from './prod-config'

type CookieReader = { get(name: string): { value: string } | undefined }
type CookieWriter = { set(name: string, value: string, options: Record<string, unknown>): unknown }

const ADMIN_MAX_AGE = 60 * 60 * 24 * 7
const PALANTIR_MAX_AGE = 60 * 60 * 12

const DEV_SECRET = 'spacebook-dev-only-session-secret'

function getSecret(): string | null {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  // Local dev only. Production always needs a real secret, including mock-mode
  // deployments: the Palantir routes don't check MOCK_MODE, and this fallback
  // is public in the repo. A missing secret fails closed: nothing verifies.
  if (process.env.NODE_ENV !== 'production') return DEV_SECRET
  console.error('[auth-cookies] SESSION_SECRET is not set — rejecting all admin/palantir sessions')
  return null
}

const enc = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function message(kind: string, scope: string, value: string, exp: number) {
  return enc.encode(`${kind}|${scope}|${value}|${exp}`)
}

export async function signCookieValue(kind: string, scope: string, value: string, maxAgeSec: number): Promise<string> {
  const secret = getSecret()
  if (!secret) throw new Error('SESSION_SECRET is not set')
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), message(kind, scope, value, exp))
  return `${b64url(enc.encode(value))}.${exp}.${b64url(new Uint8Array(sig))}`
}

export async function verifyCookieValue(kind: string, scope: string, raw: string | undefined): Promise<string | null> {
  if (!raw) return null
  const secret = getSecret()
  if (!secret) return null

  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [encodedValue, expStr, encodedSig] = parts
  const exp = Number(expStr)
  if (!Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000)) return null

  try {
    const value = new TextDecoder().decode(fromB64url(encodedValue))
    // crypto.subtle.verify compares in constant time
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(encodedSig), message(kind, scope, value, exp))
    return ok ? value : null
  } catch {
    return null
  }
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge }
}

// ─── admin_{slug} ─────────────────────────────────────────────────────────────

export async function setAdminCookie(store: CookieWriter, slug: string, role: AdminRole) {
  store.set(`admin_${slug}`, await signCookieValue('admin', slug, role, ADMIN_MAX_AGE), cookieOptions(ADMIN_MAX_AGE))
}

/** The verified admin role for this workspace, or null if the cookie is missing, forged or expired. */
export async function readAdminRole(store: CookieReader, slug: string): Promise<AdminRole | null> {
  const role = await verifyCookieValue('admin', slug, store.get(`admin_${slug}`)?.value)
  return role === 'admin' || role === 'super_admin' ? role : null
}

// ─── palantir_session ─────────────────────────────────────────────────────────

function palantirAdmins(): string[] {
  return (process.env.PALANTIR_ADMINS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

export async function setPalantirCookie(store: CookieWriter, email: string) {
  store.set('palantir_session', await signCookieValue('palantir', '-', email, PALANTIR_MAX_AGE), cookieOptions(PALANTIR_MAX_AGE))
}

/**
 * The verified Palantir email, or null. Also requires the email to still be
 * in PALANTIR_ADMINS, so removing someone from the env var revokes them
 * immediately instead of when their cookie expires.
 */
export async function readPalantirSession(store: CookieReader): Promise<string | null> {
  const email = await verifyCookieValue('palantir', '-', store.get('palantir_session')?.value)
  if (!email) return null
  return palantirAdmins().includes(email.toLowerCase()) ? email : null
}
