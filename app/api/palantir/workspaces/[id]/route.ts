import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { readPalantirSession } from '@/lib/auth-cookies'

async function requirePalantir() {
  const cookieStore = await cookies()
  return readPalantirSession(cookieStore)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requirePalantir()) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { is_trial, max_rooms, max_members, max_bookings } = body

  if (typeof is_trial !== 'boolean') return Response.json({ error: 'is_trial must be boolean' }, { status: 400 })
  const validateLimit = (v: unknown) => v === null || (typeof v === 'number' && v > 0 && Number.isInteger(v))
  if (!validateLimit(max_rooms) || !validateLimit(max_members) || !validateLimit(max_bookings)) {
    return Response.json({ error: 'max_* must be a positive integer or null' }, { status: 400 })
  }

  const { setLimits } = await import('@/lib/prod-config')
  await setLimits(params.id, { is_trial, max_rooms, max_members, max_bookings })
  return Response.json({ ok: true })
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
