import { type NextRequest } from 'next/server'
import { getBookingByToken } from '@/lib/data'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const booking = await getBookingByToken(params.token)
  if (!booking) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(booking)
}
