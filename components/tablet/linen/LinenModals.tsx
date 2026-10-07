'use client'

import { useState } from 'react'
import type { Booking } from '@/types'
import { isPlaceholderEmail } from '@/lib/booking-access'
import { NameAutocomplete } from '@/components/NameAutocomplete'
import { DAYS_LONG, DAYS_SHORT, MONTHS, fmtHour, pad } from './time'

// Same fields, copy and rules as the Classic tablet's pop-ups, in the Linen style.

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7)   // 7am–11pm, as in Classic
const MINS = ['00', '15', '30', '45']
const ORD = ['1st', '2nd', '3rd', '4th', '5th']

const inputStyle = { fontSize: 18, height: 56, padding: '0 18px', border: '1.5px solid #ddd2c1', borderRadius: 16, outline: 'none', fontFamily: 'inherit', width: '100%', color: '#2a2522', background: '#ffffff' } as const

function to12(hhmmStr: string) {
  const [h, m] = hhmmStr.split(':').map(Number)
  return `${h % 12 || 12}:${pad(m)}`
}
function whenLabel(date: string, start: string, end: string) {
  if (!date) return ''
  const d = new Date(`${date}T12:00:00`)
  const day = `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return start && end ? `${day} · ${to12(start)} – ${to12(end)}` : day
}

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [h, m] = value ? value.split(':') : ['', '']
  return (
    <div>
      <span className="ln-lbl">{label}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <select className="ln-sel" aria-label={`${label} hour`} value={h} onChange={e => onChange(`${e.target.value}:${m || '00'}`)}>
          <option value="" disabled>HH</option>
          {HOURS.map(x => <option key={x} value={pad(x)}>{fmtHour(x)}</option>)}
        </select>
        <select className="ln-sel" aria-label={`${label} minutes`} value={m} onChange={e => onChange(`${h || '09'}:${e.target.value}`)}>
          <option value="" disabled>MM</option>
          {MINS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
    </div>
  )
}

function CloseX({ onClick }: { onClick: () => void }) {
  return (
    <button className="ln-mx" onClick={onClick} aria-label="Close">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  )
}

function Overlay({ onClose, children, small }: { onClose: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <div className="ln-modal" onClick={onClose}>
      <div className={`ln-mcard${small ? ' small' : ''}`} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

// ─── Schedule for later ──────────────────────────────────────────────────────

export interface ScheduleForm {
  date: string; start: string; end: string
  name: string; email: string; title: string
  recur: 'none' | 'weekly' | 'monthly'; until: string
}

export function ScheduleModal({ roomName, workspace, today, form, onChange, onStartTime, submitting, done, error, onConfirm, onClose }: {
  roomName: string; workspace: string; today: string
  form: ScheduleForm; onChange: (patch: Partial<ScheduleForm>) => void; onStartTime: (t: string) => void
  submitting: boolean; done: boolean; error: string | null
  onConfirm: () => void; onClose: () => void
}) {
  const when = whenLabel(form.date, form.start, form.end)
  if (done) {
    return (
      <Overlay onClose={onClose}>
        <div className="ln-done">
          <div className="ln-tick"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
          <h2 className="ln-mtitle">Booking confirmed!</h2>
          <div className="ln-msub" style={{ marginTop: 8 }}>Your room is reserved.</div>
          <div className="ln-msub" style={{ marginTop: 4, color: '#2a2522', fontWeight: 600 }}>{roomName} · {when}</div>
          <div className="ln-mactions"><button className="ln-mbtn ln-mconfirm" onClick={onClose}>Done</button></div>
        </div>
      </Overlay>
    )
  }

  const badOrder = !!form.start && !!form.end && form.end <= form.start
  const canConfirm = !submitting && !!form.start && !!form.end && !badOrder && !(form.recur !== 'none' && !form.until)
  let recurDesc = ''
  if (form.recur !== 'none' && form.date) {
    const d = new Date(`${form.date}T12:00:00`)
    recurDesc = form.recur === 'weekly'
      ? `Every ${DAYS_LONG[d.getDay()]}`
      : `Every ${ORD[Math.ceil(d.getDate() / 7) - 1] ?? `${Math.ceil(d.getDate() / 7)}th`} ${DAYS_LONG[d.getDay()]} of the month`
  }

  return (
    <Overlay onClose={onClose}>
      <div className="ln-mhead">
        <div>
          <h2 className="ln-mtitle">Schedule for later</h2>
          <div className="ln-msub">{roomName}{when ? ` · ${when}` : ''}</div>
        </div>
        <CloseX onClick={onClose} />
      </div>
      <div className="ln-field">
        <label className="ln-lbl" htmlFor="ln-date">Date</label>
        <input id="ln-date" className="ln-inp" type="date" min={today} value={form.date} onChange={e => onChange({ date: e.target.value })} />
      </div>
      <div className="ln-field">
        <label className="ln-lbl">Your name</label>
        <NameAutocomplete value={form.name} onChange={v => onChange({ name: v })} onSelect={u => onChange({ name: u.name, email: u.email })} workspace={workspace} style={inputStyle} />
      </div>
      <div className="ln-field">
        <label className="ln-lbl" htmlFor="ln-email">Email <span className="ln-hint">Not visible to others</span></label>
        <input id="ln-email" className="ln-inp" type="email" placeholder="you@example.com" value={form.email} onChange={e => onChange({ email: e.target.value })} />
      </div>
      <div className="ln-field">
        <label className="ln-lbl" htmlFor="ln-title">Title <span className="ln-warn">⚠ Everyone can see this</span></label>
        <input id="ln-title" className="ln-inp" placeholder="e.g. Team standup" value={form.title} onChange={e => onChange({ title: e.target.value })} />
      </div>
      <div className="ln-field ln-row2">
        <TimeSelect label="Start time" value={form.start} onChange={onStartTime} />
        <TimeSelect label="End time" value={form.end} onChange={v => onChange({ end: v })} />
      </div>
      {badOrder && <div className="ln-merr" style={{ margin: '-4px 0 12px' }}>End time must be after start time.</div>}
      <div className="ln-field" style={{ marginBottom: 0 }}>
        <span className="ln-lbl">Repeat</span>
        <div className="ln-reps">
          {(['none', 'weekly', 'monthly'] as const).map(f => (
            <button key={f} className={`ln-rep${form.recur === f ? ' on' : ''}`} onClick={() => onChange({ recur: f })}>
              {f === 'none' ? 'None' : f === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
        {recurDesc && (
          <>
            <div className="ln-recur">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
              {recurDesc}
            </div>
            <label className="ln-lbl" htmlFor="ln-until">Repeat until</label>
            <input id="ln-until" className="ln-inp" type="date" min={form.date} value={form.until} onChange={e => onChange({ until: e.target.value })} />
          </>
        )}
      </div>
      {error && <div className="ln-merr">{error}</div>}
      <div className="ln-mactions">
        <button className="ln-mbtn ln-mcancel" onClick={onClose}>Cancel</button>
        <button className="ln-mbtn ln-mconfirm" disabled={!canConfirm} onClick={onConfirm}>{submitting ? 'Booking…' : 'Confirm'}</button>
      </div>
    </Overlay>
  )
}

// ─── Edit booking ────────────────────────────────────────────────────────────

export interface EditForm { name: string; email: string; date: string; start: string; end: string }

export function EditModal({ booking, roomName, workspace, form, onChange, isOthers, submitting, error, onSave, onCancelBooking, onClose }: {
  booking: Booking; roomName: string; workspace: string
  form: EditForm; onChange: (patch: Partial<EditForm>) => void
  isOthers: boolean; submitting: boolean; error: string | null
  onSave: () => void; onCancelBooking: () => void; onClose: () => void
}) {
  const invalid = !form.start || !form.end || form.end <= form.start
  return (
    <Overlay onClose={onClose}>
      <div className="ln-mhead">
        <div>
          <h2 className="ln-mtitle">Edit booking</h2>
          <div className="ln-msub">{roomName} · {whenLabel(form.date, form.start, form.end)}</div>
        </div>
        <CloseX onClick={onClose} />
      </div>
      {isOthers && (
        <div className="ln-others">
          {isPlaceholderEmail(booking.booker_email)
            ? <>This is a <b>walk-in</b>. When you save or cancel, you’ll be asked whether it’s yours or you have permission.</>
            : <>This is <b>{booking.booker_name}</b>’s booking. When you save or cancel, you’ll be asked whether it’s yours or you have their permission, and they’ll get an email.</>}
        </div>
      )}
      {/* Who a booking belongs to can only be changed by its booker (ADR-023) */}
      {!isOthers && (
        <>
          <div className="ln-field">
            <label className="ln-lbl">Your name</label>
            <NameAutocomplete value={form.name} onChange={v => onChange({ name: v })} onSelect={u => onChange({ name: u.name, email: u.email })} workspace={workspace} style={inputStyle} />
          </div>
          <div className="ln-field">
            <label className="ln-lbl" htmlFor="ln-eemail">Email</label>
            <input id="ln-eemail" className="ln-inp" type="email" value={form.email} onChange={e => onChange({ email: e.target.value })} />
          </div>
        </>
      )}
      <div className="ln-field">
        <label className="ln-lbl" htmlFor="ln-edate">Date</label>
        <input id="ln-edate" className="ln-inp" type="date" value={form.date} onChange={e => onChange({ date: e.target.value })} />
      </div>
      <div className="ln-field ln-row2" style={{ marginBottom: 0 }}>
        <TimeSelect label="Start time" value={form.start} onChange={v => onChange({ start: v })} />
        <TimeSelect label="End time" value={form.end} onChange={v => onChange({ end: v })} />
      </div>
      {invalid && <div className="ln-merr">End time must be after start time.</div>}
      {error && <div className="ln-merr">{error}</div>}
      <div className="ln-mactions">
        <button className="ln-mbtn ln-mcancel" onClick={onClose}>Close</button>
        <button className="ln-mbtn ln-mconfirm" disabled={submitting || invalid || !form.name || !form.email} onClick={onSave}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      <button className="ln-textbtn" onClick={onCancelBooking}>Cancel this booking</button>
    </Overlay>
  )
}

export function ConfirmCancelModal({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <Overlay onClose={onNo} small>
      <h2 className="ln-mtitle">Cancel this booking?</h2>
      <div className="ln-msub" style={{ marginTop: 8 }}>This cannot be undone.</div>
      <div className="ln-mactions">
        <button className="ln-mbtn ln-mcancel" onClick={onNo}>No, go back</button>
        <button className="ln-mbtn ln-mdanger" onClick={onYes}>Yes, cancel it</button>
      </div>
    </Overlay>
  )
}

// ─── Someone else's booking (ADR-023) ───────────────────────────────────────

export type OthersChoice = 'mine' | 'permission' | 'ask'
export interface AskForm { name: string; email: string; note: string }

/** Cancelling or changing a booking that isn't verifiably yours: say why, or
 *  ask the booker instead. `action` is what the person was about to do. */
export function OthersBookingModal({ booking, action, submitting, error, sent, onDoNow, onAsk, onClose }: {
  booking: Booking
  action: 'cancel' | 'change'
  submitting: boolean
  error: string | null
  sent: boolean
  onDoNow: (reason: 'mine' | 'permission', actorName: string) => void
  onAsk: (form: AskForm) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<OthersChoice | null>(null)
  const [actorName, setActorName] = useState('')
  const [ask, setAsk] = useState<AskForm>({ name: '', email: '', note: '' })
  // A walk-in's booker is unknown: same questions, but nobody to email or ask
  const walkIn = isPlaceholderEmail(booking.booker_email)
  const first = walkIn ? 'the walk-in' : booking.booker_name.split(' ')[0]
  const verb = action === 'cancel' ? 'Cancel booking' : 'Save changes'

  if (sent) {
    return (
      <Overlay onClose={onClose}>
        <div className="ln-done">
          <div className="ln-tick"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
          <h2 className="ln-mtitle">Request sent</h2>
          <div className="ln-msub" style={{ marginTop: 8 }}>We emailed {first}. You’ll get a copy, and another email if they cancel or move it.</div>
          <div className="ln-mactions"><button className="ln-mbtn ln-mconfirm" onClick={onClose}>Done</button></div>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay onClose={onClose}>
      <div className="ln-mhead">
        <div>
          <h2 className="ln-mtitle">{action === 'cancel' ? 'Cancel' : 'Change'} {walkIn ? 'this walk-in' : `${first}’s booking`}?</h2>
          <div className="ln-msub">{walkIn
            ? `Someone booked this at the tablet without leaving their name. Only ${action === 'cancel' ? 'cancel' : 'change'} it if it’s yours or you have their permission.`
            : `Booked by ${booking.booker_name}. They’ll get an email either way.`}</div>
        </div>
        <CloseX onClick={onClose} />
      </div>

      {step === null && (
        <div className="ln-choices">
          <button className="ln-choice" disabled={submitting} onClick={() => onDoNow('mine', '')}>
            <b>This was my meeting</b><span>{action === 'cancel' ? 'Cancel it now.' : 'Save the changes now.'}{!walkIn && ` ${first} will get an email saying “you ${action === 'cancel' ? 'cancelled' : 'changed'} this”.`}</span>
          </button>
          <button className="ln-choice" onClick={() => setStep('permission')}>
            <b>I have their permission</b><span>{action === 'cancel' ? 'Cancel it now.' : 'Save the changes now.'}{walkIn ? ' We’ll note your name.' : ` ${first} will get an email with your name.`}</span>
          </button>
          {!walkIn && (
            <button className="ln-choice" onClick={() => setStep('ask')}>
              <b>Ask {first} to {action === 'cancel' ? 'cancel' : 'change'} it</b><span>Nothing changes yet. We’ll email them your note, and tell you if the time frees up.</span>
            </button>
          )}
          {walkIn && <div className="ln-msub" style={{ marginTop: 4 }}>If neither is true, leave it as it is.</div>}
        </div>
      )}

      {step === 'permission' && (
        <>
          <div className="ln-field" style={{ marginTop: 20 }}>
            <label className="ln-lbl" htmlFor="ln-actor">Your name {!walkIn && <span className="ln-hint">{first} will see this</span>}</label>
            <input id="ln-actor" className="ln-inp" value={actorName} onChange={e => setActorName(e.target.value)} />
          </div>
          {error && <div className="ln-merr">{error}</div>}
          <div className="ln-mactions">
            <button className="ln-mbtn ln-mcancel" onClick={() => setStep(null)}>Back</button>
            <button className={`ln-mbtn ${action === 'cancel' ? 'ln-mdanger' : 'ln-mconfirm'}`} disabled={submitting || !actorName.trim()} onClick={() => onDoNow('permission', actorName.trim())}>
              {submitting ? 'Working…' : verb}
            </button>
          </div>
        </>
      )}

      {step === 'ask' && (
        <>
          <div className="ln-field" style={{ marginTop: 20 }}>
            <label className="ln-lbl" htmlFor="ln-askname">Your name</label>
            <input id="ln-askname" className="ln-inp" value={ask.name} onChange={e => setAsk({ ...ask, name: e.target.value })} />
          </div>
          <div className="ln-field">
            <label className="ln-lbl" htmlFor="ln-askemail">Your email <span className="ln-hint">So {first} can reply</span></label>
            <input id="ln-askemail" className="ln-inp" type="email" placeholder="you@example.com" value={ask.email} onChange={e => setAsk({ ...ask, email: e.target.value })} />
          </div>
          <div className="ln-field" style={{ marginBottom: 0 }}>
            <label className="ln-lbl" htmlFor="ln-asknote">Note <span className="ln-hint">Optional</span></label>
            <textarea id="ln-asknote" className="ln-ta" maxLength={500} placeholder="e.g. Could we swap? I need the room at 2." value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} />
          </div>
          {error && <div className="ln-merr">{error}</div>}
          <div className="ln-mactions">
            <button className="ln-mbtn ln-mcancel" onClick={() => setStep(null)}>Back</button>
            <button className="ln-mbtn ln-mconfirm" disabled={submitting || !ask.name.trim() || !ask.email.trim()} onClick={() => onAsk({ ...ask, name: ask.name.trim(), email: ask.email.trim() })}>
              {submitting ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </>
      )}

      {step === null && error && <div className="ln-merr">{error}</div>}
    </Overlay>
  )
}
