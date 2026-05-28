'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { Booking } from '@/types'

const SAGE = '#5C7A6B'
const NAVY = '#2C3E6B'
const BUSY = '#B94040'; const BUSY_BG = '#FAEAEA'

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString('en-AU', opts)
}

export default function CancelPage() {
  const router = useRouter()
  const { workspace, token } = useParams<{ workspace: string; token: string }>()
  const api = `/api/${workspace}`
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'this' | 'future' | 'all'>('this')
  const [cancelling, setCancelling] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${api}/bookings/by-token/${token}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setBooking(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [api, token])

  async function handleCancel() {
    setCancelling(true)
    const res = await fetch(`/api/cancel/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope }),
    })
    if (res.ok) {
      setDone(true)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Something went wrong.')
      setCancelling(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
    </div>
  )

  if (!booking || booking.cancelled_at) return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', border: '0.5px solid #E0E4E8', borderRadius: 14, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: NAVY, marginBottom: 8 }}>
          {booking?.cancelled_at ? 'Already cancelled' : 'Booking not found'}
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>This booking link is no longer valid.</div>
        <a href="/" style={{ color: SAGE, fontSize: 13, textDecoration: 'none' }}>← Back to bookings</a>
      </div>
    </div>
  )

  if (done) return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', border: '0.5px solid #E0E4E8', borderRadius: 14, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: NAVY, marginBottom: 8 }}>Booking cancelled</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>The time slot has been freed up.</div>
        <a href="/" style={{ display: 'inline-block', background: SAGE, color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
          Make a new booking
        </a>
      </div>
    </div>
  )

  const date = fmt(booking.start_time, { weekday: 'long', day: 'numeric', month: 'long' })
  const startTime = fmt(booking.start_time, { hour: '2-digit', minute: '2-digit' })
  const endTime = fmt(booking.end_time, { hour: '2-digit', minute: '2-digit' })
  const inp: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '0.5px solid #C8CDD4', borderRadius: 8, outline: 'none', width: '100%', fontFamily: 'inherit', background: '#fff' }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', border: '0.5px solid #E0E4E8', borderRadius: 14, padding: 32, maxWidth: 440, width: '100%' }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: NAVY, marginBottom: 4 }}>Cancel booking</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>Are you sure you want to cancel this booking?</div>

        <div style={{ background: '#F8F8F6', borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 13 }}>
          {[
            ['Date', date],
            ['Time', `${startTime} – ${endTime}`],
            ['Booked by', booking.booker_name],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 16 }}>
              <span style={{ color: '#9CA3AF' }}>{l}</span>
              <span style={{ color: '#374151', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>

        {booking.recurring_series_id && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: 500 }}>This is a recurring booking. Cancel:</div>
            {(['this', 'future', 'all'] as const).map(s => {
              const labels = { this: 'Just this occurrence', future: 'This and all future occurrences', all: 'The entire series' }
              return (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 0', fontSize: 13, color: '#374151' }}>
                  <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} style={{ accentColor: BUSY }} />
                  {labels[s]}
                </label>
              )
            })}
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: BUSY, background: BUSY_BG, padding: '8px 12px', borderRadius: 8, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/" style={{ flex: 1, display: 'block', textAlign: 'center', background: 'none', border: '0.5px solid #C8CDD4', borderRadius: 8, padding: '9px 16px', fontSize: 13, color: '#6B7280', textDecoration: 'none' }}>
            Keep booking
          </a>
          <button onClick={handleCancel} disabled={cancelling}
            style={{ flex: 1, background: cancelling ? '#E0B0B2' : BUSY, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: cancelling ? 'default' : 'pointer' }}>
            {cancelling ? 'Cancelling…' : 'Yes, cancel it'}
          </button>
        </div>
      </div>
    </div>
  )
}
