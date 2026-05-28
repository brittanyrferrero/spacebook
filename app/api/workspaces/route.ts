import { type NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { name } = await req.json().catch(() => ({}))

  if (process.env.MOCK_MODE === 'true') {
    return Response.json({ slug: 'demo', admin_entry_token: 'mock-token' }, { status: 201 })
  }

  const { createWorkspace } = await import('@/lib/workspace')
  try {
    const workspace = await createWorkspace(name?.trim() || undefined)
    return Response.json({
      slug: workspace.slug,
      name: workspace.name,
      admin_entry_token: workspace.admin_entry_token,
    }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: msg }, { status: 500 })
  }
}
