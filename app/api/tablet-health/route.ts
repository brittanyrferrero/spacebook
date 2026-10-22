import { type NextRequest } from 'next/server'
import type { TabletStatusRow, TabletStatusKind } from '@/lib/email'
import type { AlertState } from '@/lib/tablet-health'

export const dynamic = 'force-dynamic'

// Tablet health check (ADR-024). Called daily by Vercel Cron and every 15 minutes by
// the GitHub Actions schedule in .github/workflows/tablet-health.yml. Emails each
// workspace's super admins once when a tablet goes quiet or gets unplugged, and once
// when it's back to normal.
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { Redis } = await import('@upstash/redis')
  const { createClient } = await import('@/lib/supabase/server')
  const { getAdmins } = await import('@/lib/prod-config')
  const { sendTabletStatusEmail } = await import('@/lib/email')
  const { seenKey, alertKey, unpluggedAlertKey, parseRecord, isOffline, isUnplugged, likelyCause, recoveryNote, fmtDuration } = await import('@/lib/tablet-health')

  const kv = Redis.fromEnv()
  const supabase = await createClient()
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, is_active, workspace_id, workspaces(slug, name)')
  if (!rooms) return Response.json({ error: 'Could not load rooms' }, { status: 500 })

  const active = (rooms as any[]).filter(r => r.is_active)
  if (active.length === 0) return Response.json({ checked: 0, wentOffline: 0, cameBack: 0, unplugged: 0, pluggedIn: 0 })

  // One round trip for every room's liveness record and alert state
  const p = kv.pipeline()
  for (const r of active) {
    p.hgetall(seenKey(r.workspace_id, r.id))
    p.get(alertKey(r.workspace_id, r.id))
    p.get(unpluggedAlertKey(r.workspace_id, r.id))
  }
  const results = await p.exec()

  const now = new Date()
  const KINDS: TabletStatusKind[] = ['offline', 'unplugged', 'online', 'pluggedIn']
  type WorkspaceRows = { slug: string; name: string | null; rows: Record<TabletStatusKind, TabletStatusRow[]> }
  const byWorkspace = new Map<string, WorkspaceRows>()
  const writes = kv.pipeline()
  let checked = 0, wentOffline = 0, cameBack = 0, unplugged = 0, pluggedIn = 0, pendingWrites = 0

  active.forEach((room, i) => {
    const rec = parseRecord(results[i * 3] as Record<string, unknown> | null)
    const alert = results[i * 3 + 1] as AlertState | null
    const unplugAlert = results[i * 3 + 2] as AlertState | null
    if (!rec) return // no tablet has ever reported for this room (or it's been gone 30+ days)
    checked++

    const ws: WorkspaceRows = byWorkspace.get(room.workspace_id) ?? {
      slug: room.workspaces?.slug ?? 'unknown', name: room.workspaces?.name ?? null,
      rows: { offline: [], online: [], unplugged: [], pluggedIn: [] },
    }
    byWorkspace.set(room.workspace_id, ws)
    const offline = isOffline(rec, now)
    const quietFor = fmtDuration(now.getTime() - new Date(rec.lastSeen).getTime())

    if (offline && !alert) {
      ws.rows.offline.push({ roomName: room.name, detail: `Last heard from ${quietFor} ago. ${likelyCause(rec)}` })
      pendingWrites++; writes.set(alertKey(room.workspace_id, room.id), { alertedAt: now.toISOString(), lastSeen: rec.lastSeen }, { ex: 60 * 60 * 24 * 30 })
      wentOffline++
    } else if (!offline && alert) {
      const downFor = fmtDuration(now.getTime() - new Date(alert.lastSeen).getTime())
      ws.rows.online.push({ roomName: room.name, detail: `Reporting in again after going quiet ${downFor} ago. ${recoveryNote(rec, alert)}`.trim() })
      pendingWrites++; writes.del(alertKey(room.workspace_id, room.id))
      cameBack++
    }

    // Unplugged warnings only apply while the tablet is still reporting in; once it
    // dies the offline alert takes over, and the "back online" email covers the return.
    if (offline) return
    if (isUnplugged(rec, now) && !unplugAlert) {
      const offFor = fmtDuration(now.getTime() - new Date(rec.unpluggedSince!).getTime())
      const battery = rec.battery !== undefined ? `, and the battery is at ${Math.round(rec.battery)}%` : ''
      ws.rows.unplugged.push({ roomName: room.name, detail: `Running on battery for about ${offFor}${battery}.` })
      pendingWrites++; writes.set(unpluggedAlertKey(room.workspace_id, room.id), { alertedAt: now.toISOString(), lastSeen: rec.lastSeen }, { ex: 60 * 60 * 24 * 30 })
      unplugged++
    } else if (rec.charging === true && unplugAlert) {
      pendingWrites++; writes.del(unpluggedAlertKey(room.workspace_id, room.id))
      if (alert) return // it died and came back; the "back online" email already says so
      ws.rows.pluggedIn.push({ roomName: room.name, detail: 'Charging again.' })
      pluggedIn++
    }
  })

  // Record alert state before emailing so a slow or failing send can't cause repeats
  if (pendingWrites > 0) await writes.exec()

  for (const [workspaceId, ws] of Array.from(byWorkspace)) {
    if (KINDS.every(kind => ws.rows[kind].length === 0)) continue
    const superAdmins = (await getAdmins(workspaceId)).filter(a => a.role === 'super_admin')
    if (superAdmins.length === 0) {
      console.warn('[tablet health] no super admin to notify', { workspace: ws.slug })
      continue
    }
    for (const { email: to } of superAdmins) {
      for (const kind of KINDS) {
        const list = ws.rows[kind]
        if (list.length === 0) continue
        try { await sendTabletStatusEmail({ to, kind, workspaceSlug: ws.slug, workspaceName: ws.name, rooms: list }) }
        catch (err) { console.error('[tablet health] failed to send email', { to, kind, err }) }
      }
    }
  }

  return Response.json({ checked, wentOffline, cameBack, unplugged, pluggedIn })
}
