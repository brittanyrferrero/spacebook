import { type NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { appUrl } from '@/lib/email'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')
  const error = searchParams.get('error')

  let workspace: string | null = null
  let roomId: string | null = null
  let nonce: string | null = null
  try {
    const state = JSON.parse(stateRaw ?? '{}')
    const raw = state.workspace ?? null
    // Validate slug format to prevent open redirect via attacker-controlled state
    workspace = typeof raw === 'string' && /^[a-z0-9-]{1,64}$/.test(raw) ? raw : null
    roomId = state.roomId ?? null
    nonce = state.nonce ?? null
  } catch { /* ignore */ }

  const adminUrl = new URL('/', req.url)
  if (workspace) { adminUrl.pathname = `/${workspace}/admin`; adminUrl.searchParams.set('tab', 'Rooms') }

  if (error || !code || !roomId || !workspace || !nonce) {
    adminUrl.searchParams.set('gcal', 'error_state')
    return NextResponse.redirect(adminUrl)
  }

  try {
    const { verifyAndConsumeGcalNonce } = await import('@/lib/prod-config')
    const nonceData = await verifyAndConsumeGcalNonce(nonce)
    if (!nonceData || nonceData.workspace !== workspace || nonceData.roomId !== roomId) {
      adminUrl.searchParams.set('gcal', 'error_nonce')
      return NextResponse.redirect(adminUrl)
    }

    const { getWorkspaceId } = await import('@/lib/workspace')
    const workspaceId = await getWorkspaceId(workspace)
    if (!workspaceId) {
      adminUrl.searchParams.set('gcal', 'error_workspace')
      return NextResponse.redirect(adminUrl)
    }
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: room } = await supabase.from('rooms').select('id').eq('id', roomId).eq('workspace_id', workspaceId).maybeSingle()
    if (!room) {
      adminUrl.searchParams.set('gcal', 'error_room')
      return NextResponse.redirect(adminUrl)
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${appUrl()}/api/gcal/callback`,
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      adminUrl.searchParams.set('gcal', 'no_refresh_token')
      return NextResponse.redirect(adminUrl)
    }

    const { saveTokens } = await import('@/lib/google-calendar/tokenStore')
    await saveTokens(roomId, {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? undefined,
      expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
    })

    adminUrl.searchParams.set('gcal', 'pick')
    adminUrl.searchParams.set('room_id', roomId)
    return NextResponse.redirect(adminUrl)
  } catch (e) {
    console.error('[gcal callback]', e)
    adminUrl.searchParams.set('gcal', 'error_exception')
    return NextResponse.redirect(adminUrl)
  }
}
