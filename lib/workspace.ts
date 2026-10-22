import { generateWorkspaceSlug } from './words'

// Slugs that collide with public route segments — a workspace named any of these
// would bypass middleware auth checks for all its API routes.
export const RESERVED_SLUGS = new Set([
  // top-level page segments (PUBLIC_SEGMENTS in middleware)
  'enter', 'admin-enter', 'demo', 'demo-admin', 'landing', 'landing2',
  'home', 'cancel', 'privacy', 'terms', 'generate',
  'palantir', 'palantir-enter',
  // top-level API segments (PUBLIC_API_SEGMENTS in middleware)
  'cancel', 'workspaces', 'notify', 'demo-access', 'admin', 'palantir',
  'delete-confirm', 'gcal', 'gcal-renew', 'tablet-health', 'version', 'find-my-workspaces',
  // Next.js / infrastructure
  'api', '_next',
])

export interface Workspace {
  id: string
  slug: string
  name: string | null
  admin_entry_token: string
  created_at: string
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function getSupabase() {
  const { createClient } = await import('./supabase/server')
  return createClient()
}

export async function getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.from('workspaces').select('*').eq('slug', slug).single()
  // PGRST116 = no row found — a genuine "doesn't exist". Any other error (timeout,
  // connection blip, rate limit) must not be treated the same way: doing so made a
  // transient DB hiccup on a real workspace indistinguishable from "not found",
  // which 404'd valid workspaces and crashed pages expecting an array response.
  if (error && error.code !== 'PGRST116') throw error
  return data ?? null
}

export async function createWorkspace(name?: string, preferredSlug?: string): Promise<Workspace> {
  const supabase = await getSupabase()
  let slug = preferredSlug ?? generateWorkspaceSlug()
  if (!preferredSlug) {
    // Retry if slug already taken (very unlikely but safe)
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase.from('workspaces').select('id').eq('slug', slug).single()
      if (!data) break
      slug = generateWorkspaceSlug()
    }
  }
  const adminEntryToken = crypto.randomUUID()
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ slug, name: name ?? null, admin_entry_token: adminEntryToken })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create workspace')
  return data as Workspace
}

export async function workspaceExists(slug: string): Promise<boolean> {
  const supabase = await getSupabase()
  const { data } = await supabase.from('workspaces').select('id').eq('slug', slug).single()
  return !!data
}

// Module-level cache (per serverless instance) — avoids repeated DB round-trips
const _cache = new Map<string, string>()

export async function getWorkspaceId(slug: string): Promise<string | null> {
  if (process.env.MOCK_MODE === 'true') return slug // mock: slug is used directly as "id"
  if (_cache.has(slug)) return _cache.get(slug)!
  const ws = await getWorkspaceBySlug(slug)
  if (ws) _cache.set(slug, ws.id)
  return ws?.id ?? null
}
