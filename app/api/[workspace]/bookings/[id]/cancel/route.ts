import { type NextRequest } from 'next/server'
import type { CancelScope } from '@/types'
import { getWorkspaceId } from '@/lib/workspace'
import { workspaceTimeZone } from '@/lib/time-zone'
import { ratelimit, getIP } from '@/lib/ratelimit'
import { accessFor, cleanName, isChangeReason, reasonError, shouldNotifyBooker } from '@/lib/booking-access'

const rl = ratelimit(20, '1 m')

// Anyone in the workspace may cancel any booking (ADR-023). Within 5 minutes of
// it being made, or for its verified owner or an admin, no reason is needed.
// Otherwise the person says "this was my meeting" or "I have their permission"
// (with their name), and the booker is emailed.
export async function POST(req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  const body = await req.json().catch(() => ({}))
  const scope: CancelScope = body.scope === 'future' ? 'future' : 'this'
  const actorName = cleanName(body.actorName)
  const isAdmin = !!req.cookies.get(`admin_${params.workspace}`)?.value
  const mbEmail = req.cookies.get(`mb_${params.workspace}`)?.value ?? null

  if (process.env.MOCK_MODE === 'true') {
    const [{ cancelBooking, getBookingById }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const b = getBookingById(store, params.id)
    if (!b || b.cancelled_at) return Response.json({ error: 'Booking already cancelled or not found.' }, { status: 410 })
    const access = accessFor(b, { isAdmin, mbEmail })
    const err = reasonError(access, body.reason, actorName)
    if (err) return Response.json({ error: err, code: 'reason_required' }, { status: 400 })
    const result = cancelBooking(store, b.cancel_token, scope)
    await saveSessionStore(store)
    if (shouldNotifyBooker(access, b.booker_email)) console.log('[mock] would email booker:', b.booker_email, body.reason, actorName)
    return Response.json(result)
  }

  const [{ success }, workspaceId] = await Promise.all([rl.limit(getIP(req)), getWorkspaceId(params.workspace)])
  if (!success) return Response.json({ error: 'Too many requests.' }, { status: 429 })
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: booking } = await supabase
    .from('bookings').select('*, room:rooms(*)')
    .eq('id', params.id).eq('workspace_id', workspaceId).is('cancelled_at', null)
    .single()
  if (!booking) return Response.json({ error: 'Booking already cancelled or not found.' }, { status: 410 })
  // Room blocks are an admin tool, not someone's meeting.
  if (booking.is_block && !isAdmin) return Response.json({ error: 'Only an admin can remove a room block.' }, { status: 403 })

  const access = accessFor(booking, { isAdmin, mbEmail })
  const err = reasonError(access, body.reason, actorName)
  if (err) return Response.json({ error: err, code: 'reason_required' }, { status: 400 })

  const { cancelBookingRows } = await import('@/lib/cancel-booking')
  const result = await cancelBookingRows(supabase, booking, scope)
  if (result.error) return Response.json({ error: result.error }, { status: 500 })

  if (shouldNotifyBooker(access, booking.booker_email) && isChangeReason(body.reason)) {
    const { sendBookingCancelledNoticeEmail } = await import('@/lib/email')
    await sendBookingCancelledNoticeEmail({
      to: booking.booker_email,
      bookerName: booking.booker_name,
      reason: body.reason,
      actorName,
      roomName: booking.room?.name ?? '',
      startTime: booking.start_time,
      endTime: booking.end_time,
      title: booking.title,
      count: result.cancelled,
      workspaceSlug: params.workspace,
      timeZone: await workspaceTimeZone(workspaceId),
    }).catch(e => console.error('[cancel] booker email failed:', e))
  }

  return Response.json({ cancelled: result.cancelled })
}
