import { type NextRequest } from 'next/server'
import type { CancelScope } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { scope = 'this' }: { scope: CancelScope } = await req.json().catch(() => ({ scope: 'this' }))

  if (process.env.MOCK_MODE === 'true') {
    const [{ cancelBooking }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = cancelBooking(store, params.token, scope)
    if (result.error) return Response.json({ error: result.error }, { status: 404 })
    await saveSessionStore(store)
    return Response.json(result)
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: booking } = await supabase.from('bookings').select('*, room:rooms(*)').eq('cancel_token', params.token).is('cancelled_at', null).single()
  if (!booking) return Response.json({ error: 'Booking already cancelled or not found.' }, { status: 410 })

  const { cancelBookingRows } = await import('@/lib/cancel-booking')
  const { workspaceTimeZone } = await import('@/lib/time-zone')
  const result = await cancelBookingRows(supabase, booking, scope, await workspaceTimeZone(booking.workspace_id))
  if (result.error) return Response.json({ error: result.error }, { status: 500 })
  return Response.json({ cancelled: result.cancelled })
}
