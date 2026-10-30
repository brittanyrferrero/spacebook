import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function GET(req: NextRequest, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return Response.json({ ok: false }, { status: 401 })

  if (process.env.MOCK_MODE === 'true') {
    return Response.json({ ok: true })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ ok: false }, { status: 404 })
  const { getWorkspaceToken } = await import('@/lib/prod-config')
  const expected = await getWorkspaceToken(workspaceId)
  return (expected && token === expected)
    ? Response.json({ ok: true })
    : Response.json({ ok: false }, { status: 401 })
}
