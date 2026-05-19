import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const DEFAULT_VISIBILITY = { showTitle: false, showOrganizer: false }
const DEFAULT_DISPLAY_HOURS = { start: 8, end: 20 }
const DEFAULT_BOOKING_HOURS = { start: 6, end: 22 }

export async function GET() {
  if (process.env.MOCK_MODE === 'true') {
    const { getSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()
    return NextResponse.json({
      bookingHours: store.bookingHours ?? DEFAULT_BOOKING_HOURS,
      displayHours: store.displayHours ?? DEFAULT_DISPLAY_HOURS,
      bookingVisibility: store.bookingVisibility ?? DEFAULT_VISIBILITY,
    })
  }
  const { getBookingHours, getDisplayHours, getBookingVisibility } = await import('@/lib/prod-config')
  const [bookingHours, displayHours, bookingVisibility] = await Promise.all([getBookingHours(), getDisplayHours(), getBookingVisibility()])
  return NextResponse.json({ bookingHours, displayHours, bookingVisibility })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()

  if (body.bookingHours !== undefined) {
    const { start, end } = body.bookingHours ?? {}
    if (typeof start !== 'number' || typeof end !== 'number' || end - start < 2 || start < 0 || end > 24) {
      return NextResponse.json({ error: 'Invalid booking hours.' }, { status: 400 })
    }
    if (process.env.MOCK_MODE === 'true') {
      const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
      const store = await getSessionStore()
      store.bookingHours = { start, end }
      await saveSessionStore(store)
      return NextResponse.json({ bookingHours: store.bookingHours })
    }
    const { setBookingHours } = await import('@/lib/prod-config')
    await setBookingHours({ start, end })
    return NextResponse.json({ bookingHours: { start, end } })
  }

  if (body.displayHours !== undefined) {
    const { start, end } = body.displayHours ?? {}
    if (typeof start !== 'number' || typeof end !== 'number' || end - start < 2 || start < 0 || end > 24) {
      return NextResponse.json({ error: 'Invalid display hours.' }, { status: 400 })
    }
    if (process.env.MOCK_MODE === 'true') {
      const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
      const store = await getSessionStore()
      store.displayHours = { start, end }
      await saveSessionStore(store)
      return NextResponse.json({ displayHours: store.displayHours })
    }
    const { setDisplayHours } = await import('@/lib/prod-config')
    await setDisplayHours({ start, end })
    return NextResponse.json({ displayHours: { start, end } })
  }

  if (body.bookingVisibility !== undefined) {
    const { showTitle, showOrganizer } = body.bookingVisibility ?? {}
    if (typeof showTitle !== 'boolean' || typeof showOrganizer !== 'boolean') {
      return NextResponse.json({ error: 'Invalid visibility settings.' }, { status: 400 })
    }
    if (process.env.MOCK_MODE === 'true') {
      const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
      const store = await getSessionStore()
      store.bookingVisibility = { showTitle, showOrganizer }
      await saveSessionStore(store)
      return NextResponse.json({ bookingVisibility: store.bookingVisibility })
    }
    const { setBookingVisibility } = await import('@/lib/prod-config')
    await setBookingVisibility({ showTitle, showOrganizer })
    return NextResponse.json({ bookingVisibility: { showTitle, showOrganizer } })
  }

  return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
}
