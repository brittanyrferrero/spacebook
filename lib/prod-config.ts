import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const DEFAULTS = {
  roomTypes:         ['Meeting Room', 'Conference Room', 'Boardroom', 'Focus Room', 'Phone Booth'] as string[],
  amenityOptions:    ['TV', 'Whiteboard', 'Video conferencing', 'Phone', 'Natural light'] as string[],
  bookingHours:      { start: 6, end: 22 },
  displayHours:      { start: 8, end: 20 },
  bookingVisibility: { showTitle: false, showOrganizer: false },
}

export async function getRoomTypes(): Promise<string[]> {
  return (await kv.get<string[]>('cfg:roomTypes')) ?? DEFAULTS.roomTypes
}
export async function setRoomTypes(v: string[]): Promise<void> {
  await kv.set('cfg:roomTypes', v)
}

export async function getAmenityOptions(): Promise<string[]> {
  return (await kv.get<string[]>('cfg:amenityOptions')) ?? DEFAULTS.amenityOptions
}
export async function setAmenityOptions(v: string[]): Promise<void> {
  await kv.set('cfg:amenityOptions', v)
}

export async function getBookingHours(): Promise<{ start: number; end: number }> {
  return (await kv.get<{ start: number; end: number }>('cfg:bookingHours')) ?? DEFAULTS.bookingHours
}
export async function setBookingHours(v: { start: number; end: number }): Promise<void> {
  await kv.set('cfg:bookingHours', v)
}

export async function getDisplayHours(): Promise<{ start: number; end: number }> {
  return (await kv.get<{ start: number; end: number }>('cfg:displayHours')) ?? DEFAULTS.displayHours
}
export async function setDisplayHours(v: { start: number; end: number }): Promise<void> {
  await kv.set('cfg:displayHours', v)
}

export async function getBookingVisibility(): Promise<{ showTitle: boolean; showOrganizer: boolean }> {
  return (await kv.get<{ showTitle: boolean; showOrganizer: boolean }>('cfg:bookingVisibility')) ?? DEFAULTS.bookingVisibility
}
export async function setBookingVisibility(v: { showTitle: boolean; showOrganizer: boolean }): Promise<void> {
  await kv.set('cfg:bookingVisibility', v)
}

// ─── Workspace token ─────────────────────────────────────────────────────────

export async function getWorkspaceToken(): Promise<string | null> {
  if (process.env.WORKSPACE_TOKEN) return process.env.WORKSPACE_TOKEN
  return kv.get<string>('cfg:workspace_token')
}

export async function setWorkspaceToken(token: string): Promise<void> {
  await kv.set('cfg:workspace_token', token)
}

// ─── Admin roles ──────────────────────────────────────────────────────────────

export type AdminRole = 'admin' | 'super_admin'
export interface AdminEntry { email: string; role: AdminRole }

function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

export async function getAdmins(): Promise<AdminEntry[]> {
  const stored = (await kv.get<AdminEntry[]>('cfg:admins')) ?? []
  const superEmails = superAdminEmails()
  // Merge: env var super admins always included
  const map = new Map<string, AdminRole>()
  for (const e of stored) map.set(e.email.toLowerCase(), e.role)
  for (const e of superEmails) map.set(e, 'super_admin')
  return Array.from(map.entries()).map(([email, role]) => ({ email, role }))
}

export async function setAdmins(admins: AdminEntry[]): Promise<void> {
  await kv.set('cfg:admins', admins)
}

export async function getAdminRole(email: string): Promise<AdminRole | null> {
  const lower = email.toLowerCase()
  if (superAdminEmails().includes(lower)) return 'super_admin'
  const admins = (await kv.get<AdminEntry[]>('cfg:admins')) ?? []
  return admins.find(a => a.email.toLowerCase() === lower)?.role ?? null
}
