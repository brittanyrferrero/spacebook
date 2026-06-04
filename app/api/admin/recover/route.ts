import { type NextRequest, NextResponse } from 'next/server'
import { appUrl } from '@/lib/email'

// Recovery endpoint: generates a fresh admin_entry_token for a workspace.
// Auth: Bearer token must match ADMIN_ENTRY_TOKEN env var.
// Usage: POST /api/admin/recover  { "workspace": "my-slug" }
// Returns: { "url": "https://…/admin-enter/my-slug/new-token" }
export async function POST(req: NextRequest) {
  const masterToken = process.env.ADMIN_ENTRY_TOKEN
  if (!masterToken) return NextResponse.json({ error: 'Recovery not configured.' }, { status: 503 })

  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${masterToken}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { workspace } = await req.json().catch(() => ({}))
  if (!workspace || typeof workspace !== 'string') {
    return NextResponse.json({ error: 'workspace is required.' }, { status: 400 })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: ws } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', workspace)
    .single()

  if (!ws) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })

  const newToken = crypto.randomUUID()
  const { error } = await supabase
    .from('workspaces')
    .update({ admin_entry_token: newToken })
    .eq('id', ws.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const origin = appUrl()
  return NextResponse.json({
    url: `${origin}/admin-enter/${ws.slug}/${newToken}`,
  })
}
