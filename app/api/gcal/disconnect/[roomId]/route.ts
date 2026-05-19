import { type NextRequest } from 'next/server'

export async function DELETE(_req: NextRequest, { params }: { params: { roomId: string } }) {
  const { removeTokens } = await import('@/lib/google-calendar/tokenStore')
  await removeTokens(params.roomId)
  return Response.json({ disconnected: true })
}
