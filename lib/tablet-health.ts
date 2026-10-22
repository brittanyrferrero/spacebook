import type { Redis } from '@upstash/redis'

// Tablet liveness tracking (ADR-024). Tablets can't announce that they're turning
// off, so "offline" means "stopped reporting": every tablet write refreshes
// `lastSeen`, and the tablet-health cron flags rooms whose tablet has gone quiet.
//
// Linen tablets send a heartbeat with device details (battery, visibility, network
// drops) so the alert can say *why* it probably went quiet. Classic tablets are
// frozen (ADR-021), so they only refresh `lastSeen` via their snapshot uploads.

export const OFFLINE_AFTER_MS = 15 * 60_000
// A tablet unseen for this long is treated as decommissioned and forgotten
const RECORD_TTL_S = 60 * 60 * 24 * 30

export const seenKey  = (workspaceId: string, roomId: string) => `tablet:seen:${workspaceId}:${roomId}`
export const alertKey = (workspaceId: string, roomId: string) => `tablet:alert:${workspaceId}:${roomId}`

export interface TabletRecord {
  lastSeen: string
  lastSnapshotAt?: string
  pageStartedAt?: string    // only Linen heartbeats send this
  battery?: number          // 0–100
  charging?: boolean
  lastEvent?: 'hidden' | 'pagehide'
  lastEventAt?: string
  offlineMs?: number        // most recent network drop the browser noticed
  offlineReportedAt?: string
}

export interface AlertState { alertedAt: string; lastSeen: string }

// Upstash auto-deserialises hash values, so numbers/booleans may come back as
// either type. Normalise to the TabletRecord shape and drop anything unexpected.
export function parseRecord(raw: Record<string, unknown> | null): TabletRecord | null {
  if (!raw || typeof raw.lastSeen !== 'string') return null
  const str  = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const num  = (v: unknown) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? undefined : Number(v))
  const bool = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : v === true || v === 1 || v === '1' || v === 'true')
  const event = raw.lastEvent === 'hidden' || raw.lastEvent === 'pagehide' ? raw.lastEvent : undefined
  return {
    lastSeen: raw.lastSeen,
    lastSnapshotAt: str(raw.lastSnapshotAt),
    pageStartedAt: str(raw.pageStartedAt),
    battery: num(raw.battery),
    charging: bool(raw.charging),
    lastEvent: event,
    lastEventAt: str(raw.lastEventAt),
    offlineMs: num(raw.offlineMs),
    offlineReportedAt: str(raw.offlineReportedAt),
  }
}

export async function recordTabletSeen(kv: Redis, workspaceId: string, roomId: string, fields: Record<string, string | number>) {
  const key = seenKey(workspaceId, roomId)
  const p = kv.pipeline()
  p.hset(key, { ...fields, lastSeen: new Date().toISOString() })
  p.expire(key, RECORD_TTL_S)
  await p.exec()
}

export function isOffline(rec: TabletRecord, now: Date) {
  return now.getTime() - new Date(rec.lastSeen).getTime() > OFFLINE_AFTER_MS
}

export function fmtDuration(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`
  const d = Math.round(h / 24)
  return `${d} days`
}

// Best guess at why a tablet went quiet, from the last things it told us.
export function likelyCause(rec: TabletRecord): string {
  const seen = new Date(rec.lastSeen).getTime()
  // Only trust a goodbye event if it was (nearly) the last thing we heard
  const goodbye = rec.lastEvent && rec.lastEventAt && seen - new Date(rec.lastEventAt).getTime() < 60_000
    ? rec.lastEvent : undefined
  const batteryNote = rec.battery !== undefined
    ? ` Battery was at ${Math.round(rec.battery)}% and ${rec.charging ? 'charging' : 'not plugged in'}.`
    : ''

  if (!rec.pageStartedAt) {
    return 'It stopped sending screenshots. This tablet uses the Classic design, which reports less detail — it may be off, offline, or showing a sign-in page.'
  }
  if (goodbye === 'pagehide') {
    return `The spacebook page was closed, or the browser navigated away from it.${batteryNote}`
  }
  if (rec.battery !== undefined && !rec.charging && rec.battery <= 15) {
    return `It probably ran out of power — battery was at ${Math.round(rec.battery)}% and not plugged in.`
  }
  if (goodbye === 'hidden') {
    return `The screen went to sleep, the tablet was switched off, or another app was opened over spacebook.${batteryNote}`
  }
  return `It lost contact suddenly with no warning — most likely the wifi dropped, the power went out, or the browser crashed.${batteryNote}`
}

// What the tablet told us after it came back, in hindsight.
export function recoveryNote(rec: TabletRecord, alert: AlertState): string {
  const notes: string[] = []
  if (rec.pageStartedAt && rec.pageStartedAt > alert.lastSeen) {
    notes.push('The page restarted, so the tablet was likely rebooted or the browser reopened.')
  }
  if (rec.offlineMs && rec.offlineReportedAt && rec.offlineReportedAt > alert.lastSeen) {
    notes.push(`The tablet reports it lost its network connection for about ${fmtDuration(rec.offlineMs)}.`)
  }
  return notes.join(' ')
}
