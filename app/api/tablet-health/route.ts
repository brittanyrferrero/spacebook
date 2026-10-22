import { type NextRequest } from 'next/server'
import type { TabletStatusRow } from '@/lib/email'
import type { AlertState } from '@/lib/tablet-health'

export const dynamic = 'force-dynamic'

// Tablet-offline check (ADR-024). Called daily by Vercel Cron and every 15 minutes by
// the GitHub Actions schedule in .github/workflows/tablet-health.yml. Emails each
// workspace's super admins once when a tablet goes quiet, and once when it's back.
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { Redis } = await import('@upstash/redis')
  const { createClient } = await import('@/lib/supabase/server')
  const { getAdmins } = await import('@/lib/prod-config')
  const { sendTabletStatusEmail } = await import('@/lib/email')
  const { seenKey, alertKey, parseRecord, isOffline, likelyCause, recoveryNote, fmtDuration } = await import('@/lib/tablet-health')

  const kv = Redis.fromEnv()
  const supabase = await createClient()
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, is_active, workspace_id, workspaces(slug, name)')
  if (!rooms) return Response.json({ error: 'Could not load rooms' }, { status: 500 })

  const active = (rooms as any[]).filter(r => r.is_active)
  if (active.length === 0) return Response.json({ checked: 0, wentOffline: 0, cameBack: 0 })

  // One round trip for every room's liveness record and alert state
  const p = kv.pipeline()
  for (const r of active) { p.hgetall(seenKey(r.workspace_id, r.id)); p.get(alertKey(r.workspace_id, r.id)) }
  const results = await p.exec()

  const now = new Date()
  const byWorkspace = new Map<string, { slug: string; name: string | null; offline: TabletStatusRow[]; online: TabletStatusRow[] }>()
  const writes = kv.pipeline()
  let checked = 0, wentOffline = 0, cameBack = 0

  active.forEach((room, i) => {
    const rec = parseRecord(results[i * 2] as Record<string, unknown> | null)
    const alert = results[i * 2 + 1] as AlertState | null
    if (!rec) return // no tablet has ever reported for this room (or it's been gone 30+ days)
    checked++

    const ws = byWorkspace.get(room.workspace_id) ?? { slug: room.workspaces?.slug ?? 'unknown', name: room.workspaces?.name ?? null, offline: [] as TabletStatusRow[], online: [] as TabletStatusRow[] }
    byWorkspace.set(room.workspace_id, ws)
    const quietFor = fmtDuration(now.getTime() - new Date(rec.lastSeen).getTime())

    if (isOffline(rec, now) && !alert) {
      ws.offline.push({ roomName: room.name, detail: `Last heard from ${quietFor} ago. ${likelyCause(rec)}` })
      writes.set(alertKey(room.workspace_id, room.id), { alertedAt: now.toISOString(), lastSeen: rec.lastSeen }, { ex: 60 * 60 * 24 * 30 })
      wentOffline++
    } else if (!isOffline(rec, now) && alert) {
      const downFor = fmtDuration(now.getTime() - new Date(alert.lastSeen).getTime())
      ws.online.push({ roomName: room.name, detail: `Reporting in again after going quiet ${downFor} ago. ${recoveryNote(rec, alert)}`.trim() })
      writes.del(alertKey(room.workspace_id, room.id))
      cameBack++
    }
  })

  // Record alert state before emailing so a slow or failing send can't cause repeats
  if (wentOffline + cameBack > 0) await writes.exec()

  for (const [workspaceId, ws] of Array.from(byWorkspace)) {
    if (ws.offline.length === 0 && ws.online.length === 0) continue
    const superAdmins = (await getAdmins(workspaceId)).filter(a => a.role === 'super_admin')
    if (superAdmins.length === 0) {
      console.warn('[tablet health] no super admin to notify', { workspace: ws.slug })
      continue
    }
    for (const { email: to } of superAdmins) {
      for (const kind of ['offline', 'online'] as const) {
        const list = kind === 'offline' ? ws.offline : ws.online
        if (list.length === 0) continue
        try { await sendTabletStatusEmail({ to, kind, workspaceSlug: ws.slug, workspaceName: ws.name, rooms: list }) }
        catch (err) { console.error('[tablet health] failed to send email', { to, kind, err }) }
      }
    }
  }

  return Response.json({ checked, wentOffline, cameBack })
}
