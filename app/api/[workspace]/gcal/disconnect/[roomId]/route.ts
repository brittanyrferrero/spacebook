import { type NextRequest } from 'next/server'

export async function DELETE(_req: NextRequest, { params }: { params: { roomId: string } }) {
  const [{ removeTokens }, { getWatchState, removeWatchState }] = await Promise.all([
    import('@/lib/google-calendar/tokenStore'),
    import('@/lib/google-calendar/watchStore'),
  ])

  // Stop the GCal push watch if registered
  const watchState = await getWatchState(params.roomId)
  if (watchState) {
    try {
      const { google } = await import('googleapis')
      const { getTokens } = await import('@/lib/google-calendar/tokenStore')
      const tokens = await getTokens(params.roomId)
      if (tokens) {
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
