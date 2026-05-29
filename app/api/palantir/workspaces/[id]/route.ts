import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

async function requirePalantir() {
  const cookieStore = await cookies()
  return cookieStore.get('palantir_session')?.value ?? null
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requirePalantir()) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { confirm_slug } = await req.json()
  if (!confirm_slug) return Response.json({ error: 'confirm_slug required' }, { status: 400 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: workspace } = await supabase.from('workspaces').select('id, slug').eq('id', params.id).single()
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  if (workspace.slug !== confirm_slug) return Response.json({ error: 'Slug does not match' }, { status: 400 })

  // Delete in dependency order
  await supabase.from('bookings').delete().eq('workspace_id', params.id)
  await supabase.from('recurring_series').delete().eq('workspace_id', params.id)
  await supabase.from('members').delete().eq('workspace_id', params.id)
  await supabase.from('rooms').delete().eq('workspace_id', params.id)
  await supabase.from('workspaces').delete().eq('id', params.id)

  return Response.json({ ok: true })
}
