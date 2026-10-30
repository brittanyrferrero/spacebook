import { type NextRequest } from 'next/server'

// Global (non-workspace-scoped) disconnect, called only from the Palantir
// super-admin panel (app/admin/page.tsx) — gated on the same palantir_session
// cookie every other app/api/palantir/* route requires.
export async function DELETE(req: NextRequest, props: { params: Promise<{ roomId: string }> }) {
  const params = await props.params;
  if (!req.cookies.get('palantir_session')?.value) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ getTokens, removeTokens }, { getWatchState, removeWatchState }] = await Promise.all([
    import('@/lib/google-calendar/tokenStore'),
    import('@/lib/google-calendar/watchStore'),
  ])

  // Clean up watch state here, same as the workspace disconnect route. The
  // renewal cron no longer deletes watch state when tokens are missing
  // (ADR-019), so without this a Palantir disconnect would leave an orphaned
  // watch that the cron retries and counts as an error every day.
  const watchState = await getWatchState(params.roomId)
  if (watchState) {
    try {
      const tokens = await getTokens(params.roomId)
      if (tokens) {
        const { google } = await import('googleapis')
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
        oauth2Client.setCredentials({ refresh_token: tokens.refresh_token })
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
        await calendar.channels.stop({ requestBody: { id: watchState.channelId, resourceId: watchState.resourceId } })
      }
    } catch { /* non-fatal */ }
    await removeWatchState(params.roomId, watchState.channelId)
  }

  await removeTokens(params.roomId)
  return Response.json({ disconnected: true })
}
