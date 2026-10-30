import { type NextRequest } from 'next/server'
import { ratelimit, getIP } from '@/lib/ratelimit'

// A tablet beats every 2 minutes, plus a beacon on hide/close; this leaves lots of headroom
const rl = ratelimit(20, '1 m')

// Liveness ping from Linen tablets (ADR-024). Sent every 2 minutes with fetch, and
// once via navigator.sendBeacon when the page is hidden or closed — sendBeacon posts
// text/plain, so the body is read as text and parsed here rather than via req.json().
export async function POST(req: NextRequest, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
  if (process.env.MOCK_MODE === 'true') return Response.json({ ok: true })
  const wsToken = req.cookies.get(`ws_${params.workspace}`)?.value
  if (!wsToken) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await rl.limit(`tablet-heartbeat:${getIP(req)}`)).success) return Response.json({ error: 'Too many requests' }, { status: 429 })

  let body: Record<string, unknown>
  try { body = JSON.parse(await req.text()) } catch { return Response.json({ error: 'Invalid payload' }, { status: 400 }) }
  const { roomId } = body
  if (typeof roomId !== 'string' || !/^[\w-]{1,64}$/.test(roomId)) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const fields: Record<string, string | number> = {}
  const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !isNaN(Date.parse(v))
  if (isIso(body.pageStartedAt)) fields.pageStartedAt = body.pageStartedAt
  if (typeof body.battery === 'number' && body.battery >= 0 && body.battery <= 100) fields.battery = Math.round(body.battery)
  if (typeof body.charging === 'boolean') fields.charging = body.charging ? 1 : 0
  if (body.event === 'hidden' || body.event === 'pagehide') {
    fields.lastEvent = body.event
    fields.lastEventAt = new Date().toISOString()
  }
  if (typeof body.offlineMs === 'number' && body.offlineMs > 0 && body.offlineMs < 1e10) {
    fields.offlineMs = Math.round(body.offlineMs)
    fields.offlineReportedAt = new Date().toISOString()
  }

  const { getWorkspaceId } = await import('@/lib/workspace')
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Not found' }, { status: 404 })

  const { Redis } = await import('@upstash/redis')
  const { recordTabletSeen, roomBelongsToWorkspace } = await import('@/lib/tablet-health')
  if (!(await roomBelongsToWorkspace(workspaceId, roomId))) return Response.json({ error: 'Not found' }, { status: 404 })
  await recordTabletSeen(Redis.fromEnv(), workspaceId, roomId, fields)

  return Response.json({ ok: true })
}
