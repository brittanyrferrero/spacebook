import { type NextRequest } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const wsToken = req.cookies.get(`ws_${params.workspace}`)?.value
  if (!wsToken) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { roomId, image } = body
  if (!roomId || typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,')) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }
  if (image.length > 800_000) {
    return Response.json({ error: 'Image too large' }, { status: 413 })
  }

  const { getWorkspaceId } = await import('@/lib/workspace')
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Not found' }, { status: 404 })

  const { Redis } = await import('@upstash/redis')
  const kv = Redis.fromEnv()
  await kv.set(
    `tablet:snap:${workspaceId}:${roomId}`,
    { image, capturedAt: new Date().toISOString() },
    { ex: 60 * 60 * 48 }
  )
  // Snapshots double as the liveness signal for Classic tablets, which don't send heartbeats (ADR-024)
  const { recordTabletSeen } = await import('@/lib/tablet-health')
  await recordTabletSeen(kv, workspaceId, roomId, { lastSnapshotAt: new Date().toISOString() })

  return Response.json({ ok: true })
}

export async function GET(req: NextRequest, { params }: { params: { workspace: string } }) {
  const wsToken      = req.cookies.get(`ws_${params.workspace}`)?.value
  const adminToken   = req.cookies.get(`admin_${params.workspace}`)?.value
  const palantir     = req.cookies.get('palantir_session')?.value
  if (!wsToken && !adminToken && !palantir) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const roomId = new URL(req.url).searchParams.get('roomId')
  if (!roomId) return Response.json({ error: 'roomId required' }, { status: 400 })

  const { getWorkspaceId } = await import('@/lib/workspace')
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ snapshot: null })

  const { Redis } = await import('@upstash/redis')
  const kv = Redis.fromEnv()
  const data = await kv.get<{ image: string; capturedAt: string }>(`tablet:snap:${workspaceId}:${roomId}`)

  return Response.json(data ?? { snapshot: null })
}
