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

export async function getBookingVisibility(workspaceId: string): Promise<{ showTitle: boolean; showOrganizer: boolean; allowEditOthers: boolean }> {
  const stored = await kv().get<{ showTitle: boolean; showOrganizer: boolean; allowEditOthers?: boolean }>(k(workspaceId, 'cfg:bookingVisibility'))
  return { ...DEFAULTS.bookingVisibility, ...(stored ?? {}) }
}
export async function setBookingVisibility(workspaceId: string, v: { showTitle: boolean; showOrganizer: boolean; allowEditOthers: boolean }): Promise<void> {
  await kv().set(k(workspaceId, 'cfg:bookingVisibility'), v)
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

export async function isWorkspaceUnclaimed(workspaceId: string): Promise<boolean> {
  const admins = (await kv().get<AdminEntry[]>(k(workspaceId, 'cfg:admins'))) ?? []
  return admins.length === 0
}
