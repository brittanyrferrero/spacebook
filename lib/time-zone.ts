// Workspace time zone (IANA name). Emails format times in it; see lib/email.ts.

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true } catch { return false }
}

/** The workspace's time zone, or null if none has been set. Never throws:
 *  an email should still go out (in UTC) if this lookup fails. */
export async function workspaceTimeZone(workspaceId: string | null | undefined): Promise<string | null> {
  try {
    if (process.env.MOCK_MODE === 'true') {
      const { getSessionStore } = await import('@/lib/mock/store')
      return (await getSessionStore()).timeZone ?? null
    }
    if (!workspaceId) return null
    const { getTimeZone } = await import('@/lib/prod-config')
    const tz = await getTimeZone(workspaceId)
    return isValidTimeZone(tz) ? tz : null
  } catch (err) {
    console.error('[time-zone] lookup failed:', err)
    return null
  }
}

/** Same, looked up by workspace slug (the routes under /api/[workspace]). */
export async function workspaceTimeZoneBySlug(slug: string): Promise<string | null> {
  if (process.env.MOCK_MODE === 'true') return workspaceTimeZone(null)
  try {
    const { getWorkspaceId } = await import('@/lib/workspace')
    return workspaceTimeZone(await getWorkspaceId(slug))
  } catch (err) {
    console.error('[time-zone] lookup failed:', err)
    return null
  }
}
