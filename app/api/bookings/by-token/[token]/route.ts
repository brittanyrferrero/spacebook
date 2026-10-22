import { type NextRequest } from 'next/server'
import { getBookingByToken } from '@/lib/data'

export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const booking = await getBookingByToken(params.token)
  if (!booking) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(booking)
}
