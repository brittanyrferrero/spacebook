import { Redis } from '@upstash/redis'

let _kv: Redis | null = null
function kv(): Redis {
  if (!_kv) {
    _kv = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  }
  return _kv
}

const DEFAULTS = {
  roomTypes:         ['Meeting Room', 'Conference Room', 'Boardroom', 'Focus Room', 'Phone Booth'] as string[],
  amenityOptions:    ['TV', 'Whiteboard', 'Video conferencing', 'Phone', 'Natural light'] as string[],
  bookingHours:      { start: 6, end: 22 },
  displayHours:      { start: 8, end: 20 },
  bookingVisibility: { showTitle: false, showOrganizer: false, allowEditOthers: false },
  countWeekends:     false,
}

// All KV keys are namespaced by workspaceId
function k(workspaceId: string, key: string) { return `ws:${workspaceId}:${key}` }

export async function getRoomTypes(workspaceId: string): Promise<string[]> {
  return (await kv().get<string[]>(k(workspaceId, 'cfg:roomTypes'))) ?? DEFAULTS.roomTypes
}
export async function setRoomTypes(workspaceId: string, v: string[]): Promise<void> {
  await kv().set(k(workspaceId, 'cfg:roomTypes'), v)
}

export async function getAmenityOptions(workspaceId: string): Promise<string[]> {
  return (await kv().get<string[]>(k(workspaceId, 'cfg:amenityOptions'))) ?? DEFAULTS.amenityOptions
}
export async function setAmenityOptions(workspaceId: string, v: string[]): Promise<void> {
  await kv().set(k(workspaceId, 'cfg:amenityOptions'), v)
}

export async function getBookingHours(workspaceId: string): Promise<{ start: number; end: number }> {
  return (await kv().get<{ start: number; end: number }>(k(workspaceId, 'cfg:bookingHours'))) ?? DEFAULTS.bookingHours
}
export async function setBookingHours(workspaceId: string, v: { start: number; end: number }): Promise<void> {
  await kv().set(k(workspaceId, 'cfg:bookingHours'), v)
}

export async function getDisplayHours(workspaceId: string): Promise<{ start: number; end: number }> {
  return (await kv().get<{ start: number; end: number }>(k(workspaceId, 'cfg:displayHours'))) ?? DEFAULTS.displayHours
}
export async function setDisplayHours(workspaceId: string, v: { start: number; end: number }): Promise<void> {
  await kv().set(k(workspaceId, 'cfg:displayHours'), v)
}

export async function getCountWeekends(workspaceId: string): Promise<boolean> {
  return (await kv().get<boolean>(k(workspaceId, 'cfg:countWeekends'))) ?? DEFAULTS.countWeekends
}
export async function setCountWeekends(workspaceId: string, v: boolean): Promise<void> {
  await kv().set(k(workspaceId, 'cfg:countWeekends'), v)
}

export async function getBookingVisibility(workspaceId: string): Promise<{ showTitle: boolean; showOrganizer: boolean; allowEditOthers: boolean }> {
  const stored = await kv().get<{ showTitle: boolean; showOrganizer: boolean; allowEditOthers?: boolean }>(k(workspaceId, 'cfg:bookingVisibility'))
  return { ...DEFAULTS.bookingVisibility, ...(stored ?? {}) }
}
export async function setBookingVisibility(workspaceId: string, v: { showTitle: boolean; showOrganizer: boolean; allowEditOthers: boolean }): Promise<void> {
  await kv().set(k(workspaceId, 'cfg:bookingVisibility'), v)
}

// ─── Workspace limits ─────────────────────────────────────────────────────────

export interface WorkspaceLimits {
  is_trial: boolean
  max_rooms: number | null     // null = unlimited
  max_members: number | null   // null = unlimited
  max_bookings: number | null  // null = unlimited (counts total ever created)
}

export const TRIAL_LIMITS: WorkspaceLimits = {
  is_trial: true,
  max_rooms: 10,
  max_members: 3,
  max_bookings: 50,
}

export async function getLimits(workspaceId: string): Promise<WorkspaceLimits | null> {
  return kv().get<WorkspaceLimits>(k(workspaceId, 'limits'))
}

export async function setLimits(workspaceId: string, limits: WorkspaceLimits): Promise<void> {
  await kv().set(k(workspaceId, 'limits'), limits)
}

// ─── Workspace entry token ────────────────────────────────────────────────────

export async function getWorkspaceToken(workspaceId: string): Promise<string | null> {
  return kv().get<string>(k(workspaceId, 'entry_token'))
}
export async function setWorkspaceToken(workspaceId: string, token: string): Promise<void> {
  await kv().set(k(workspaceId, 'entry_token'), token)
}

// ─── Admin roles ──────────────────────────────────────────────────────────────

export type AdminRole = 'admin' | 'super_admin'
export interface AdminEntry { email: string; role: AdminRole }

export async function getAdmins(workspaceId: string): Promise<AdminEntry[]> {
  return (await kv().get<AdminEntry[]>(k(workspaceId, 'cfg:admins'))) ?? []
}

export async function setAdmins(workspaceId: string, admins: AdminEntry[]): Promise<void> {
  await kv().set(k(workspaceId, 'cfg:admins'), admins)
}

export async function getAdminRole(workspaceId: string, email: string): Promise<AdminRole | null> {
  const lower = email.toLowerCase()
  const admins = (await kv().get<AdminEntry[]>(k(workspaceId, 'cfg:admins'))) ?? []
  return admins.find(a => a.email.toLowerCase() === lower)?.role ?? null
}

// ─── GCal OAuth nonces ────────────────────────────────────────────────────────
// Stored when an admin initiates the OAuth flow; verified and consumed in the
// callback to prove the flow was legitimately started and bind it to a workspace/room.

export async function setGcalNonce(nonce: string, workspace: string, roomId: string): Promise<void> {
  await kv().set(`gcal:nonce:${nonce}`, JSON.stringify({ workspace, roomId }), { ex: 600 })
}

export async function verifyAndConsumeGcalNonce(nonce: string): Promise<{ workspace: string; roomId: string } | null> {
  const key = `gcal:nonce:${nonce}`
  const val = await kv().get<string>(key)
  if (!val) return null
  await kv().del(key)
  try { return JSON.parse(val) } catch { return null }
}

export async function isWorkspaceUnclaimed(workspaceId: string): Promise<boolean> {
  const admins = (await kv().get<AdminEntry[]>(k(workspaceId, 'cfg:admins'))) ?? []
  return admins.length === 0
}

// ─── Recovery nonces ──────────────────────────────────────────────────────────
// Short-lived one-time tokens used in recovery emails. Each nonce expires after
// 1 hour and is consumed on first use, preventing replay via email/browser history.

export async function setRecoveryNonce(workspaceId: string, nonce: string, email: string): Promise<void> {
  await kv().set(`recovery:nonce:${nonce}`, JSON.stringify({ workspaceId, email }), { ex: 3600 })
}

export async function verifyAndConsumeRecoveryNonce(nonce: string): Promise<{ workspaceId: string; email: string } | null> {
  const key = `recovery:nonce:${nonce}`
  const raw = await kv().get<string>(key)
  if (!raw) return null
  await kv().del(key)
  try {
    const parsed = typeof raw === 'object' ? raw : JSON.parse(raw as string)
    if (typeof parsed === 'string') return { workspaceId: parsed, email: '' } // legacy format
    return parsed as { workspaceId: string; email: string }
  } catch {
    return null
  }
}
