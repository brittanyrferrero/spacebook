import { type NextRequest } from 'next/server'
import { ratelimit, getIP } from '@/lib/ratelimit'

const rl = ratelimit(5, '1 h')

const SLUG_RE = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$|^[a-z0-9]{3,64}$/

export async function POST(req: NextRequest) {
  const { name, slug: requestedSlug } = await req.json().catch(() => ({}))

  if (name && name.trim().length > 200) {
    return Response.json({ error: 'Workspace name must be 200 characters or fewer.' }, { status: 400 })
  }

  if (requestedSlug !== undefined) {
    if (typeof requestedSlug !== 'string' || !SLUG_RE.test(requestedSlug)) {
      return Response.json({ error: 'Slug must be 3–64 lowercase letters, numbers, or hyphens, starting and ending with a letter or number.' }, { status: 400 })
    }
    const { RESERVED_SLUGS } = await import('@/lib/workspace')
    if (RESERVED_SLUGS.has(requestedSlug)) {
      return Response.json({ error: 'That slug is reserved. Please choose another.' }, { status: 400 })
    }
  }

  if (process.env.MOCK_MODE === 'true') {
    return Response.json({ slug: 'demo', admin_entry_token: 'mock-token' }, { status: 201 })
  }

  const { success } = await rl.limit(getIP(req))
  if (!success) return Response.json({ error: 'Too many requests.' }, { status: 429 })

  const { createWorkspace, workspaceExists } = await import('@/lib/workspace')

  if (requestedSlug) {
    const taken = await workspaceExists(requestedSlug)
    if (taken) return Response.json({ error: 'That slug is already taken. Please choose another.' }, { status: 409 })
  }

  try {
    const workspace = await createWorkspace(name?.trim() || undefined, requestedSlug)
    const { setLimits, TRIAL_LIMITS } = await import('@/lib/prod-config')
    await setLimits(workspace.id, TRIAL_LIMITS)
    return Response.json({
      slug: workspace.slug,
      name: workspace.name,
      admin_entry_token: workspace.admin_entry_token,
    }, { status: 201 })
  } catch (e) {
    console.error('Failed to create workspace:', e)
    return Response.json({ error: 'Failed to create workspace.' }, { status: 500 })
  }
}
