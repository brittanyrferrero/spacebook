import { type NextRequest } from 'next/server'
import { appUrl, isValidEmail } from '@/lib/email'

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { requesterEmail } = await req.json()
  if (!requesterEmail?.trim()) return Response.json({ error: 'Email required.' }, { status: 400 })
  if (!isValidEmail(requesterEmail)) return Response.json({ error: 'Invalid email address.' }, { status: 400 })

  const { getWorkspaceBySlug } = await import('@/lib/workspace')
  const workspace = await getWorkspaceBySlug(params.workspace)
  if (!workspace) return Response.json({ error: 'Workspace not found.' }, { status: 404 })

  // Verify the email is a super_admin for this workspace
  const { getAdmins } = await import('@/lib/prod-config')
  const admins = await getAdmins(workspace.id)
  const match = admins.find(a => a.email.toLowerCase() === requesterEmail.trim().toLowerCase())
  if (!match || match.role !== 'super_admin') {
    return Response.json({ error: 'Only super admins can request workspace deletion.' }, { status: 403 })
  }

  const token = crypto.randomUUID()
  const r = await kv()
  await r.set(`delete_request:token:${token}`, JSON.stringify({
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name || workspace.slug,
    requesterEmail: requesterEmail.trim().toLowerCase(),
    requestedAt: new Date().toISOString(),
  }), { ex: 60 * 60 * 24 })

  const base = appUrl()
  const url = `${base}/api/delete-confirm/${token}`

  const { sendWorkspaceDeleteRequestEmail } = await import('@/lib/email')
  await sendWorkspaceDeleteRequestEmail({
    to: match.email,
    workspaceName: workspace.name || workspace.slug,
    requesterEmail: match.email,
    url,
  })

  return Response.json({ ok: true })
}
