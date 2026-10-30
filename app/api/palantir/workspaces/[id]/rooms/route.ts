import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

async function requirePalantir() {
  const cookieStore = await cookies()
  return cookieStore.get('palantir_session')?.value ?? null
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requirePalantir())) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { createClient } = await import('@/lib/supabase/server')
  const sb = await createClient()
  const { data, error } = await sb
    .from('rooms')
    .select('id, name, room_type')
    .eq('workspace_id', params.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
