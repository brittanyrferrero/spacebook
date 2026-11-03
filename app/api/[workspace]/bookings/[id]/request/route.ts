import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'
import { workspaceTimeZone } from '@/lib/time-zone'
import { ratelimit, getIP } from '@/lib/ratelimit'
import { isValidEmail } from '@/lib/email'
import { cleanName, isPlaceholderEmail } from '@/lib/booking-access'

// Each request emails a real person, so it's limited per sender and per booking.
const rlIp = ratelimit(5, '1 h')
const rlBooking = ratelimit(3, '1 h')

const MAX_NOTE = 500

// "Ask them to cancel or change it" (ADR-023). Nothing about the booking
// changes. The booker is emailed (Reply-To the requester) and the requester
// gets a receipt. If the booker frees the time, they tell the requester.
export async function POST(req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  const body = await req.json().catch(() => ({}))
  const name = cleanName(body.name)
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : ''
  const kind: 'cancel' | 'change' = body.kind === 'change' ? 'change' : 'cancel'

  if (!name) return Response.json({ error: 'Please add your name.' }, { status: 400 })
  if (!isValidEmail(email)) return Response.json({ error: 'Please add a valid email address.' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const [{ getBookingById }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const b = getBookingById(await getSessionStore(), params.id)
    if (!b || b.cancelled_at) return Response.json({ error: 'Booking already cancelled or not found.' }, { status: 410 })
    console.log('[mock] would email request:', { to: b.booker_email, from: email, kind, note })
    return Response.json({ ok: true })
  }

  const [ipLimit, bookingLimit, workspaceId] = await Promise.all([
    rlIp.limit(`req:${getIP(req)}`),
    rlBooking.limit(`req:${params.id}`),
    getWorkspaceId(params.workspace),
  ])
  if (!ipLimit.success || !bookingLimit.success) {
    return Response.json({ error: 'Too many requests about this booking. Please try again later.' }, { status: 429 })
  }
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: booking } = await supabase
    .from('bookings').select('*, room:rooms(*)')
    .eq('id', params.id).eq('workspace_id', workspaceId).is('cancelled_at', null)
    .single()
  if (!booking) return Response.json({ error: 'Booking already cancelled or not found.' }, { status: 410 })
  if (booking.is_block || isPlaceholderEmail(booking.booker_email)) {
    return Response.json({ error: 'There is nobody to ask about this booking.' }, { status: 400 })
  }
  if (new Date(booking.end_time) <= new Date()) return Response.json({ error: 'This booking has already ended.' }, { status: 400 })

  const { sendBookingRequestEmail } = await import('@/lib/email')
  try {
    await sendBookingRequestEmail({
      bookerEmail: booking.booker_email,
      bookerName: booking.booker_name,
      requesterName: name,
      requesterEmail: email,
      note,
      kind,
      roomName: booking.room?.name ?? '',
      startTime: booking.start_time,
      endTime: booking.end_time,
      title: booking.title,
      cancelToken: booking.cancel_token,
      timeZone: await workspaceTimeZone(workspaceId),
    })
  } catch (e) {
    console.error('[request] email failed:', e)
    return Response.json({ error: 'Could not send the request. Please try again.' }, { status: 502 })
  }

  return Response.json({ ok: true })
}
