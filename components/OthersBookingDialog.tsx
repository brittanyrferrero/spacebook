'use client'

import { useState } from 'react'
import type { Booking } from '@/types'
import { isPlaceholderEmail } from '@/lib/booking-access'

// Desktop counterpart of Linen's OthersBookingModal (ADR-023): cancelling or
// changing a booking that isn't verifiably yours. Styled like the booking
// page's confirm dialog, which passes in its theme colours.

export interface DialogTheme { text: string; textMuted: string; border: string; cardBg: string; inputBg: string }

export function OthersBookingDialog({ booking, action, theme, defaultName, defaultEmail, submitting, error, sent, onDoNow, onAsk, onClose }: {
  booking: Booking
  action: 'cancel' | 'change'
  theme: DialogTheme
  defaultName: string
  defaultEmail: string
  submitting: boolean
  error: string | null
  sent: boolean
  onDoNow: (reason: 'mine' | 'permission', actorName: string) => void
  onAsk: (form: { name: string; email: string; note: string }) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<'choose' | 'permission' | 'ask'>('choose')
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [note, setNote] = useState('')
  const T = theme
  // A walk-in's booker is unknown: same questions, but nobody to email or ask
  const walkIn = isPlaceholderEmail(booking.booker_email)
  const first = walkIn ? 'the walk-in' : booking.booker_name.split(' ')[0]
  const danger = action === 'cancel'

  const inp: React.CSSProperties = { fontSize: 14, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 0, outline: 'none', fontFamily: 'inherit', width: '100%', color: T.text, background: T.inputBg }
  const lbl: React.CSSProperties = { fontSize: 12, color: T.textMuted, fontWeight: 500, display: 'block', marginBottom: 4 }
  const choice: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '11px 12px', background: 'none', border: `1px solid ${T.border}`, color: T.text, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }
  const primary: React.CSSProperties = { flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, background: danger ? '#B94040' : '#2C3E6B', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
  const secondary: React.CSSProperties = { flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 500, background: 'none', border: `1px solid ${T.border}`, color: T.text, cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210 }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: T.cardBg, border: `1px solid ${T.border}`, padding: '28px 24px', width: 360, maxWidth: 'calc(100vw - 32px)' }}>
        {sent ? <>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 8 }}>Request sent</div>
          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 20, lineHeight: 1.5 }}>We emailed {first}. You’ll get a copy, and another email if they cancel or move it.</div>
          <button onClick={onClose} style={{ ...primary, width: '100%', background: '#2C3E6B' }}>Done</button>
        </> : <>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>{danger ? 'Cancel' : 'Change'} {walkIn ? 'this walk-in' : `${first}’s booking`}?</div>
          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 18, lineHeight: 1.5 }}>{walkIn
            ? `Someone booked this at a tablet without leaving their name. Only ${danger ? 'cancel' : 'change'} it if it’s yours or you have their permission.`
            : `This is ${booking.booker_name}’s booking. They’ll get an email either way.`}</div>

          {step === 'choose' && <>
            <button style={choice} disabled={submitting} onClick={() => onDoNow('mine', '')}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>This was my meeting</div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{danger ? 'Cancel it now.' : 'Save the changes now.'}{!walkIn && ` ${first} gets an email saying “you ${danger ? 'cancelled' : 'changed'} this”.`}</div>
            </button>
            <button style={choice} onClick={() => setStep('permission')}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>I have their permission</div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{danger ? 'Cancel it now.' : 'Save the changes now.'}{walkIn ? ' We note your name.' : ` ${first} gets an email with your name.`}</div>
            </button>
            {!walkIn && (
              <button style={choice} onClick={() => setStep('ask')}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Ask {first} to {danger ? 'cancel' : 'change'} it</div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Nothing changes yet. We email them your note so they can reply to you.</div>
              </button>
            )}
            {walkIn && <div style={{ fontSize: 12, color: T.textMuted, margin: '0 0 8px' }}>If neither is true, leave it as it is.</div>}
            {error && <div style={{ fontSize: 12, color: '#C0392B', margin: '4px 0 8px' }}>{error}</div>}
            <button onClick={onClose} style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '4px 0', fontSize: 12, color: T.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>Go back</button>
          </>}

          {step === 'permission' && <>
            <label style={lbl} htmlFor="obd-name">Your name{!walkIn && ` (${first} will see this)`}</label>
            <input id="obd-name" style={{ ...inp, marginBottom: 16 }} value={name} onChange={e => setName(e.target.value)} />
            {error && <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={secondary} onClick={() => setStep('choose')}>Back</button>
              <button style={{ ...primary, opacity: submitting || !name.trim() ? 0.5 : 1 }} disabled={submitting || !name.trim()} onClick={() => onDoNow('permission', name.trim())}>
                {submitting ? 'Working…' : danger ? 'Cancel it' : 'Save changes'}
              </button>
            </div>
          </>}

          {step === 'ask' && <>
            <label style={lbl} htmlFor="obd-aname">Your name</label>
            <input id="obd-aname" style={{ ...inp, marginBottom: 10 }} value={name} onChange={e => setName(e.target.value)} />
            <label style={lbl} htmlFor="obd-aemail">Your email (so {first} can reply)</label>
            <input id="obd-aemail" type="email" style={{ ...inp, marginBottom: 10 }} value={email} onChange={e => setEmail(e.target.value)} />
            <label style={lbl} htmlFor="obd-anote">Note (optional)</label>
            <textarea id="obd-anote" maxLength={500} rows={3} style={{ ...inp, resize: 'vertical', marginBottom: 16 }} value={note} onChange={e => setNote(e.target.value)} />
            {error && <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={secondary} onClick={() => setStep('choose')}>Back</button>
              <button style={{ ...primary, background: '#2C3E6B', opacity: submitting || !name.trim() || !email.trim() ? 0.5 : 1 }} disabled={submitting || !name.trim() || !email.trim()} onClick={() => onAsk({ name: name.trim(), email: email.trim(), note })}>
                {submitting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </>}
        </>}
      </div>
    </div>
  )
}
