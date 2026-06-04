import { type NextRequest } from 'next/server'
import { ratelimit, getIP } from '@/lib/ratelimit'

const rl = ratelimit(5, '1 h')

export async function POST(req: NextRequest) {
  const { name } = await req.json().catch(() => ({}))

  if (process.env.MOCK_MODE === 'true') {
    return Response.json({ slug: 'demo', admin_entry_token: 'mock-token' }, { status: 201 })
  }

  const { success } = await rl.limit(getIP(req))
  if (!success) return Response.json({ error: 'Too many requests.' }, { status: 429 })

  const { createWorkspace } = await import('@/lib/workspace')
  try {
    const workspace = await createWorkspace(name?.trim() || undefined)
    const { setLimits, TRIAL_LIMITS } = await import('@/lib/prod-config')
    await setLimits(workspace.id, TRIAL_LIMITS)
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
