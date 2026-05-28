import { getBookingById, getRoomById } from '@/lib/data'
import { getWorkspaceId } from '@/lib/workspace'
import { notFound } from 'next/navigation'
import Link from 'next/link'

const SAGE = '#5C7A6B'
const NAVY = '#2C3E6B'
const ROSE = '#d49ba9'

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString('en-AU', opts)
}

export default async function ConfirmationPage({ params }: { params: { workspace: string; bookingId: string } }) {
  const workspaceId = process.env.MOCK_MODE === 'true' ? params.workspace : await getWorkspaceId(params.workspace)
  const booking = await getBookingById(params.bookingId, workspaceId ?? undefined)
  if (!booking || booking.cancelled_at) return notFound()

  const room = await getRoomById(booking.room_id, workspaceId ?? undefined)

  const date = fmt(booking.start_time, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const startTime = fmt(booking.start_time, { hour: '2-digit', minute: '2-digit' })
  const endTime = fmt(booking.end_time, { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', border: '0.5px solid #E0E4E8', borderRadius: 14, padding: 32, maxWidth: 440, width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f7eaed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="11" stroke={ROSE} strokeWidth="2"/>
              <path d="M9 14.5l3.5 3.5 6.5-7" stroke={ROSE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: NAVY }}>Booking confirmed</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>You&apos;re all set, {booking.booker_name.split(' ')[0]}!</div>
          </div>
        </div>

        {/* Details */}
        <div style={{ background: '#F8F8F6', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          {[
            ['Room', room?.name ?? booking.room_id],
            ['Date', date],
            ['Time', `${startTime} – ${endTime}`],
            ...(booking.title ? [['Purpose', booking.title]] : []),
            ['Booked by', `${booking.booker_name} · ${booking.booker_email}`],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, gap: 16 }}>
              <span style={{ color: '#9CA3AF', flexShrink: 0 }}>{label}</span>
              <span style={{ color: '#374151', textAlign: 'right' }}>{value}</span>
            </div>
          ))}
          {booking.recurring_series_id && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid #E0E4E8', fontSize: 12, color: SAGE }}>
              ↻ Recurring booking created
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link href={`/${params.workspace}`} style={{ display: 'block', textAlign: 'center', background: SAGE, color: '#fff', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
            Make another booking
          </Link>
          <Link href={`/cancel/${booking.cancel_token}`} style={{ display: 'block', textAlign: 'center', color: '#9CA3AF', fontSize: 12, textDecoration: 'none', padding: '6px 0' }}>
            Need to cancel? Use your cancellation link
          </Link>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '0.5px solid #E0E4E8', textAlign: 'center' }}>
          <Link href={`/${params.workspace}`} style={{ fontSize: 14, fontWeight: 500, color: NAVY, textDecoration: 'none' }}>
            space<span style={{ color: SAGE, fontWeight: 400 }}>book</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
