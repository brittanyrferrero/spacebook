import { type NextRequest, NextResponse } from 'next/server'
import { getWorkspaceId, RESERVED_SLUGS } from '@/lib/workspace'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { newSlug } = await req.json()
  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (adminRole !== 'super_admin') return NextResponse.json({ error: 'Super admin required.' }, { status: 403 })
  if (typeof newSlug !== 'string' || !SLUG_RE.test(newSlug)) {
    return NextResponse.json({ error: 'Invalid slug. Use lowercase letters, numbers, and hyphens (3–50 characters).' }, { status: 400 })
  }
  if (RESERVED_SLUGS.has(newSlug)) {
    return NextResponse.json({ error: 'That URL is reserved and cannot be used.' }, { status: 400 })
  }

  if (newSlug === params.workspace) {
    return NextResponse.json({ error: 'New URL must be different from the current one.' }, { status: 400 })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  // Check new slug isn't already taken
  const { data: existing } = await supabase.from('workspaces').select('id').eq('slug', newSlug).maybeSingle()
  if (existing) return NextResponse.json({ error: 'That URL is already in use.' }, { status: 409 })

  const { error } = await supabase.from('workspaces').update({ slug: newSlug }).eq('id', workspaceId)
  if (error) return NextResponse.json({ error: 'Failed to rename workspace.' }, { status: 500 })

  return NextResponse.json({ ok: true, newSlug })
}
