'use client'

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Fraunces, Figtree } from 'next/font/google'
import type { Room, Booking } from '@/types'
import { fetchJsonArray } from '@/lib/utils'
import { LINEN_CSS } from './linen/styles'
import { playTap, playConfirm, hapticTap, hapticConfirm } from './linen/sounds'
import { DayView, WeekView, MonthView } from './linen/LinenCalendar'
import { reportTimeZone } from '@/lib/report-time-zone'
import { ScheduleModal, EditModal, ConfirmCancelModal, OthersBookingModal, type ScheduleForm, type EditForm, type AskForm } from './linen/LinenModals'
import {
  addDays, dateStr, durationConflicts, fmtClock, fmtDur, hhmm, hourAfter, isoMonday, roomStatus,
  DAYS_SHORT, MONTHS, MONTHS_LONG,
} from './linen/time'

// "Linen" tablet room display (ADR-021). Same data, API calls and background jobs as
// ClassicRoomDisplay; only the presentation differs. Deliberately excludes "Finish
// early" until its permissions question is settled (ADR-020).

const fraunces = Fraunces({ subsets: ['latin'], axes: ['opsz'], variable: '--ln-serif', display: 'swap' })
const figtree  = Figtree({ subsets: ['latin'], variable: '--ln-sans', display: 'swap' })

type CalView = 'day' | 'week' | 'month'
const ACCENT = '#6f8f6a', BUSY = '#a4553a', RING_C = 817   // ring circumference in its 290 viewBox

function threeMonthsOut() { const d = new Date(); d.setMonth(d.getMonth() + 3); return dateStr(d) }
const emptySchedule = (date: string): ScheduleForm => ({ date, start: '', end: '', name: '', email: '', title: 'Occupied', recur: 'none', until: threeMonthsOut() })

export function LinenRoomDisplay() {
  const { workspace, roomId } = useParams<{ workspace: string; roomId: string }>()
  const api = `/api/${workspace}`

  // ── Data ──────────────────────────────────────────────────────────────────
  const [room,         setRoom]         = useState<Room | null>(null)
  const [allRooms,     setAllRooms]     = useState<Room[]>([])
  const [todayBkgs,    setTodayBkgs]    = useState<Booking[]>([])   // this room, today
  const [allTodayBkgs, setAllTodayBkgs] = useState<Booking[]>([])   // all rooms, today
  const [rangeBkgs,    setRangeBkgs]    = useState<Booking[]>([])   // this room, visible range
  const [gridStart,    setGridStart]    = useState(8)
  const [gridEnd,      setGridEnd]      = useState(20)
  const [showTitle,    setShowTitle]    = useState(false)

  // ── View ──────────────────────────────────────────────────────────────────
  const [now,      setNow]      = useState(() => new Date())
  const [calView,  setCalView]  = useState<CalView>('day')
  const [viewDate, setViewDate] = useState(() => new Date())
  const [toast,    setToast]    = useState<{ msg: string; err?: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  // ── Pop-ups ───────────────────────────────────────────────────────────────
  const [sched,         setSched]         = useState<ScheduleForm | null>(null)
  const [schedDone,     setSchedDone]     = useState(false)
  const [schedError,    setSchedError]    = useState<string | null>(null)
  const [submitting,    setSubmitting]    = useState(false)
  const [editBooking,   setEditBooking]   = useState<Booking | null>(null)
  const [editForm,      setEditForm]      = useState<EditForm>({ name: '', email: '', date: '', start: '', end: '' })
  const [editError,     setEditError]     = useState<string | null>(null)
  const [editSaving,    setEditSaving]    = useState(false)
  const [confirmCancel, setConfirmCancel] = useState<(() => void) | null>(null)
  const [others,        setOthers]        = useState<{ booking: Booking; action: 'cancel' | 'change' } | null>(null)
  const [othersBusy,    setOthersBusy]    = useState(false)
  const [othersError,   setOthersError]   = useState<string | null>(null)
  const [othersSent,    setOthersSent]    = useState(false)

  const todayStr = dateStr(now)
  const viewDateStr = dateStr(viewDate)
  const weekStart = isoMonday(viewDate)

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), err ? 4000 : 2600)
  }, [])

  // ── Fetching (same endpoints as Classic) ──────────────────────────────────
  const fetchRooms = useCallback(() => {
    fetchJsonArray<Room>(`${api}/rooms`).then(rooms => {
      setAllRooms(rooms)
      setRoom(rooms.find(r => r.id === roomId) ?? rooms[0] ?? null)
    })
  }, [api, roomId])

  const fetchToday = useCallback(() => {
    fetchJsonArray<Booking>(`${api}/bookings?room_id=${roomId}&date=${todayStr}`).then(setTodayBkgs)
    fetchJsonArray<Booking>(`${api}/bookings?date=${todayStr}`).then(setAllTodayBkgs)
  }, [api, roomId, todayStr])

  const fetchRange = useCallback(() => {
    let from = viewDateStr, to = viewDateStr
    if (calView === 'week') { from = dateStr(weekStart); to = dateStr(addDays(weekStart, 6)) }
    if (calView === 'month') {
      from = dateStr(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1))
      to = dateStr(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0))
    }
    fetchJsonArray<Booking>(`${api}/bookings?room_id=${roomId}&from=${from}&to=${to}`).then(setRangeBkgs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, roomId, calView, viewDateStr])

  useEffect(() => { fetchRooms(); fetchToday() }, [fetchRooms, fetchToday])
  useEffect(() => { fetchRange() }, [fetchRange])
  useEffect(() => {
    fetch(`${api}/settings`).then(r => r.json()).then(d => {
      setGridStart(d.displayHours?.start ?? 8)
      setGridEnd(d.displayHours?.end ?? 20)
      setShowTitle(d.bookingVisibility?.showTitle ?? false)
      reportTimeZone(api, d.timeZone)
    }).catch(() => {})
  }, [api])

  // Clock: minute precision is all the display shows, so check every 5s and only
  // re-render when the minute changes (lighter on the tablets than every second).
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date()
      setNow(prev => (prev.getMinutes() === n.getMinutes() && prev.getHours() === n.getHours() ? prev : n))
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // Auto-refresh bookings every 60s
  useEffect(() => {
    const id = setInterval(() => { fetchToday(); fetchRange() }, 60_000)
    return () => clearInterval(id)
  }, [fetchToday, fetchRange])

  // Reload when a new version is deployed (ADR-006)
  useEffect(() => {
    let deployed: string | null = null
    async function check() {
      try {
        const { version } = await (await fetch('/api/version')).json()
        if (deployed === null) { deployed = version; return }
        if (version !== deployed) window.location.reload()
      } catch { /* non-fatal */ }
    }
    check()
    const id = setInterval(check, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Tap sound + haptic on every button
  useEffect(() => {
    function onPress(e: PointerEvent) {
      if ((e.target as HTMLElement).closest('button')) { playTap(); hapticTap() }
    }
    window.addEventListener('pointerdown', onPress, { passive: true })
    return () => window.removeEventListener('pointerdown', onPress)
  }, [])

  // Back to today's day view, pop-ups closed, after 2 minutes of no touches
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function reset() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setCalView('day'); setViewDate(new Date())
        setSched(null); setSchedDone(false); setEditBooking(null); setConfirmCancel(null); setOthers(null)
      }, 2 * 60 * 1000)
    }
    reset()
    const events = ['pointerdown', 'touchstart', 'keydown'] as const
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [])

  // Periodic screenshot for the palantir overview (ADR-011) — same as Classic
  useEffect(() => {
    let cancelled = false
    async function capture() {
      if (cancelled) return
      try {
        const mod = await import('html2canvas')
        const canvas = await mod.default(document.body, {
          useCORS: true, allowTaint: false, scale: 1, logging: false,
          width: window.innerWidth, height: window.innerHeight,
          windowWidth: window.innerWidth, windowHeight: window.innerHeight,
        })
        if (cancelled) return
        const image = canvas.toDataURL('image/jpeg', 0.72)
        const res = await fetch(`/api/${workspace}/tablet-snapshot`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, image }),
        })
        if (!res.ok) console.error('[snapshot] upload failed', res.status)
      } catch (err) { console.error('[snapshot] capture failed', err) }
    }
    const initial = setTimeout(capture, 5_000)
    const interval = setInterval(capture, 5 * 60_000)
    return () => { cancelled = true; clearTimeout(initial); clearInterval(interval) }
  }, [workspace, roomId])

  // ── Fit the 820px-wide layout to the screen ───────────────────────────────
  // Taller screens (like the Fire tablets) stretch rather than letterbox: most of the
  // extra height grows the status ring, the rest goes to the calendar.
  const [fit, setFit] = useState({ k: 1, stageH: 1180, ring: 290, calH: 368 })
  useLayoutEffect(() => {
    function measure() {
      // The on-screen keyboard shrinks the window; don't rescale while someone is typing
      const a = document.activeElement
      if (a instanceof HTMLElement && a.closest('.ln-modal')) return
      const k = Math.min(window.innerWidth / 820, window.innerHeight / 1180)
      const stageH = Math.max(1180, Math.floor(window.innerHeight / k))
      const extra = stageH - 1180
      const ring = Math.min(420, 290 + Math.round(extra * 0.75))
      setFit({ k, stageH, ring, calH: 368 + extra - (ring - 290) })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // ── Status ────────────────────────────────────────────────────────────────
  // `now` only changes once a minute (it drives re-renders and the calendar). Status uses
  // the exact time, or a walk-in that just started would look like it starts later.
  const exact = new Date()
  const status = roomStatus(todayBkgs, exact)
  const isFree = !status.current
  const freeMins = status.minutes

  const availableRooms = allRooms
    .filter(r => r.id !== roomId)
    .map(r => ({ room: r, st: roomStatus(allTodayBkgs.filter(b => b.room_id === r.id), exact) }))
    .filter(x => !x.st.current)
    .slice(0, 3)

  // ── Actions ───────────────────────────────────────────────────────────────
  function addLocal(b: Booking | undefined) {
    if (!b?.id) return
    setRangeBkgs(p => [...p, b]); setTodayBkgs(p => [...p, b]); setAllTodayBkgs(p => [...p, b])
  }

  /** Walk-in from now for `mins` minutes, or (null) until the next booking starts. */
  async function handleWalkIn(mins: number | null) {
    if (!room || submitting) return
    const start = new Date()
    const next = roomStatus(todayBkgs, start).next
    const end = mins !== null ? new Date(start.getTime() + mins * 60000) : next ? new Date(next.start_time) : null
    if (!end || end <= start) return
    setSubmitting(true)
    const res = await fetch(`${api}/bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: room.id, booker_name: 'Walk-in', booker_email: 'walkin@tablet.spacebook.app', start_time: start.toISOString(), end_time: end.toISOString(), title: 'Occupied', origin: 'tablet' }),
    })
    if (res.ok) {
      const data = await res.json()
      addLocal(data.booking ?? data)
      setNow(new Date())
      setCalView('day'); setViewDate(new Date())
      showToast('Booked — the room is yours')
      playConfirm(); hapticConfirm()
      fetchToday(); fetchRange()
    } else {
      const body = await res.json().catch(() => ({}))
      showToast(body.error ?? 'Something went wrong. Please try again.', true)
    }
    setSubmitting(false)
  }

  function openSchedule(date: string, start = '') {
    const form = emptySchedule(date)
    if (start) { form.start = start; form.end = hourAfter(start) }
    // Same rule as Classic: pre-fill name/email only within 2 minutes of the last booking
    try {
      const saved = localStorage.getItem('spacebook_user')
      if (saved) {
        const { name, email, savedAt } = JSON.parse(saved)
        if (savedAt && Date.now() - savedAt < 2 * 60 * 1000) { form.name = name; form.email = email }
        else localStorage.removeItem('spacebook_user')
      }
    } catch {}
    setSched(form); setSchedDone(false); setSchedError(null)
  }

  async function handleScheduleConfirm() {
    if (!room || !sched) return
    if (!sched.name || !sched.email) { setSchedError('Please add your name and email.'); return }
    setSubmitting(true); setSchedError(null)
    const startTime = new Date(`${sched.date}T${sched.start}`).toISOString()
    const endTime   = new Date(`${sched.date}T${sched.end}`).toISOString()
    const jsDay = new Date(`${sched.date}T12:00:00`).getDay()
    const recurrence = sched.recur !== 'none' ? {
      frequency: sched.recur,
      days_of_week: sched.recur === 'weekly' ? [jsDay === 0 ? 7 : jsDay] : undefined,
      series_end: sched.until,
    } : undefined
    const res = await fetch(`${api}/bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: room.id, booker_name: sched.name, booker_email: sched.email, start_time: startTime, end_time: endTime, title: sched.title || null, origin: 'tablet', ...(recurrence ? { recurrence } : {}) }),
    })
    if (res.ok) {
      try { localStorage.setItem('spacebook_user', JSON.stringify({ name: sched.name, email: sched.email, savedAt: Date.now() })) } catch {}
      const data = await res.json()
      addLocal(data.booking ?? (data.id ? data : undefined))
      setCalView('day'); setViewDate(new Date(`${sched.date}T12:00:00`))
      setSchedDone(true)
      playConfirm(); hapticConfirm()
      fetchToday(); fetchRange()
    } else {
      const body = await res.json().catch(() => ({}))
      setSchedError(body.error ?? 'Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  function openEdit(b: Booking) {
    const s = new Date(b.start_time), e = new Date(b.end_time)
    setEditBooking(b)
    setEditForm({ name: b.booker_name, email: b.booker_email, date: dateStr(s), start: hhmm(s), end: hhmm(e) })
    setEditError(null)
  }

  // Someone else's booking (ADR-023): the server says whether this tablet must
  // give a reason. A booking added locally (just made here) has no flag and is direct.
  const needsReason = (b: Booking) => b.access === 'needs-reason'

  async function handleEditSave(reason?: 'mine' | 'permission', actorName = '') {
    if (!editBooking) return
    const b = editBooking
    if (needsReason(b) && !reason) { openOthers(b, 'change'); return }
    setEditSaving(true); setEditError(null); setOthersBusy(true); setOthersError(null)
    const [y, mo, d] = editForm.date.split('-').map(Number)
    const [sh, sm] = editForm.start.split(':').map(Number)
    const [eh, em] = editForm.end.split(':').map(Number)
    const res = await fetch(`${api}/bookings/${b.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Who a booking belongs to can only be changed with direct access
        ...(needsReason(b) ? {} : { booker_name: editForm.name, booker_email: editForm.email }),
        start_time: new Date(y, mo - 1, d, sh, sm).toISOString(), end_time: new Date(y, mo - 1, d, eh, em).toISOString(),
        _room_name: room?.name ?? '',
        ...(reason ? { _reason: reason, _actor_name: actorName } : {}),
      }),
    })
    setEditSaving(false); setOthersBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      // The 5-minute window ran out since the calendar last refreshed
      if (err.code === 'reason_required' && !reason) { openOthers({ ...b, access: 'needs-reason' }, 'change'); return }
      const msg = err.error ?? 'Save failed. Please try again.'
      if (others) setOthersError(msg); else setEditError(msg)
      return
    }
    const updated: Booking = await res.json()
    const swap = (p: Booking[]) => p.map(x => x.id === b.id ? { ...updated, access: x.access } : x)
    setRangeBkgs(swap); setTodayBkgs(swap); setAllTodayBkgs(swap)
    setEditBooking(null); setOthers(null)
    showToast('Booking updated')
    fetchRange(); fetchToday()
  }

  function handleEditCancel() {
    if (!editBooking) return
    const b = editBooking
    if (needsReason(b)) { openOthers(b, 'cancel'); return }
    setConfirmCancel(() => () => { setConfirmCancel(null); cancelBooking(b) })
  }

  async function cancelBooking(b: Booking, reason?: 'mine' | 'permission', actorName = '') {
    setOthersBusy(true); setOthersError(null)
    const res = await fetch(`${api}/bookings/${b.id}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'this', ...(reason ? { reason, actorName } : {}) }),
    })
    setOthersBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (err.code === 'reason_required' && !reason) { openOthers({ ...b, access: 'needs-reason' }, 'cancel'); return }
      const msg = err.error ?? 'Could not cancel. Please try again.'
      if (others) setOthersError(msg); else showToast(msg, true)
      return
    }
    const at = new Date().toISOString()
    const mark = (p: Booking[]) => p.map(x => x.id === b.id ? { ...x, cancelled_at: at } : x)
    setRangeBkgs(mark); setTodayBkgs(mark); setAllTodayBkgs(mark)
    setEditBooking(null); setOthers(null)
    showToast('Booking cancelled')
    fetchRange(); fetchToday()
  }

  function openOthers(b: Booking, action: 'cancel' | 'change') {
    setOthers({ booking: b, action }); setOthersError(null); setOthersSent(false)
  }

  async function sendRequest(form: AskForm) {
    if (!others) return
    setOthersBusy(true); setOthersError(null)
    const res = await fetch(`${api}/bookings/${others.booking.id}/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, kind: others.action }),
    })
    setOthersBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setOthersError(err.error ?? 'Could not send. Please try again.')
      return
    }
    setOthersSent(true); setEditBooking(null)
  }

  // ── Calendar navigation ───────────────────────────────────────────────────
  function shift(dir: -1 | 1) {
    const d = new Date(viewDate)
    if (calView === 'day') d.setDate(d.getDate() + dir)
    if (calView === 'week') d.setDate(d.getDate() + dir * 7)
    if (calView === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir) }
    setViewDate(d)
  }
  function openDay(d: Date) { setCalView('day'); setViewDate(d) }

  let navLabel: string
  if (calView === 'day') {
    navLabel = `${viewDateStr === todayStr ? 'Today, ' : ''}${DAYS_SHORT[viewDate.getDay()]} ${viewDate.getDate()} ${MONTHS[viewDate.getMonth()]}`
  } else if (calView === 'week') {
    const end = addDays(weekStart, 6)
    navLabel = `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`
  } else {
    navLabel = `${MONTHS_LONG[viewDate.getMonth()]} ${viewDate.getFullYear()}`
  }

  const gridProps = {
    now, gridStart, gridEnd, calH: fit.calH, scale: fit.k, showTitle,
    onSlot: (day: Date, time: string) => openSchedule(dateStr(day), time),
    onPast: () => showToast('That time has passed'),
    onBooking: openEdit,
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const ringFrac = isFree
    ? (freeMins === null ? 1 : Math.min(freeMins / 60, 1))
    : Math.max(0, Math.min(1, (+new Date(status.current!.end_time) - +exact) / (+new Date(status.current!.end_time) - +new Date(status.current!.start_time))))
  const meetingLabel = status.current && (status.current.is_block
    ? status.current.title || 'Unavailable'
    : showTitle && status.current.title && status.current.title !== 'Occupied' ? status.current.title : null)

  const durations = (() => {
    const until = status.next ? new Date(status.next.start_time) : null
    // Labels only here; handleWalkIn works out the real end time when tapped
    const opts: { label: string; mins: number | null; ok: boolean }[] = [15, 30].map(m => ({
      label: `${m} min`, mins: m, ok: !durationConflicts(todayBkgs, exact, m),
    }))
    if (until) opts.push({ label: `Until ${fmtClock(until)}`, mins: null, ok: until > exact })
    else opts.push({ label: '2 hr', mins: 120, ok: !durationConflicts(todayBkgs, exact, 120) })
    opts.push({ label: '1 hr', mins: 60, ok: !durationConflicts(todayBkgs, exact, 60) })
    return opts
  })()

  const rootVars = {
    '--k': fit.k, '--ring': `${fit.ring}px`, '--rs': (fit.ring / 290).toFixed(3), '--calh': `${fit.calH}px`,
  } as React.CSSProperties

  return (
    <div className={`ln-root ${fraunces.variable} ${figtree.variable}`} style={rootVars}>
      <style dangerouslySetInnerHTML={{ __html: LINEN_CSS }} />
      <div className="ln-stage" style={{ height: fit.stageH, transform: `translate(-50%, -50%) scale(${fit.k})` }}>
        <div className="ln-head">
          <h1 className="ln-room ln-serif">{room?.name ?? ''}</h1>
          <span className="ln-clock">{fmtClock(now)}</span>
        </div>

        <div className="ln-ringwrap">
          <svg viewBox="0 0 290 290" aria-hidden="true">
            <circle cx="145" cy="145" r="130" fill="none" stroke="#e2d8c8" strokeWidth="14" />
            <circle className="fg" cx="145" cy="145" r="130" fill="none" strokeWidth="14" strokeLinecap="round" transform="rotate(-90 145 145)"
              stroke={isFree ? ACCENT : BUSY} strokeDasharray={`${Math.round(ringFrac * RING_C)} ${RING_C}`} />
          </svg>
          <div className="ln-status" role="status">
            {isFree ? (
              <>
                <span className="ln-big ln-serif" style={{ fontSize: `calc(96px * var(--rs))` }}>Free</span>
                <span className="ln-sub">for <strong>{freeMins === null ? 'the rest of the day' : fmtDur(freeMins)}</strong></span>
                <span className="ln-note">{status.next ? `until ${fmtClock(new Date(status.next.start_time))}` : 'nothing else booked'}</span>
              </>
            ) : (
              <>
                <span className="ln-big ln-serif" style={{ fontSize: `calc(72px * var(--rs))` }}>In use</span>
                {meetingLabel && <span className="ln-sub"><strong>{meetingLabel}</strong></span>}
                <span className={meetingLabel ? 'ln-note' : 'ln-sub'}>
                  until {fmtClock(new Date(status.current!.end_time))} · {freeMins !== null && freeMins < 60 ? `${freeMins} min` : fmtDur(freeMins ?? 0)} left
                </span>
              </>
            )}
          </div>
        </div>

        {isFree ? (
          <div>
            <div className="ln-actlabel">Take it now</div>
            <div className="ln-grid4">
              {durations.map(d => (
                <button key={d.label} className="ln-dur ln-serif" disabled={!d.ok || submitting} onClick={() => handleWalkIn(d.mins)}>
                  {d.ok ? d.label : `${d.label} · clashes`}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="ln-actlabel">Other rooms free now</div>
            {availableRooms.length === 0 ? (
              <div className="ln-none">No other rooms are free right now</div>
            ) : (
              <div className="ln-grid3">
                {availableRooms.map(({ room: r, st }) => (
                  <div key={r.id} className="ln-near">
                    <b>{r.name}</b>
                    <span>{st.next ? `free till ${fmtClock(new Date(st.next.start_time))}` : 'free all day'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="ln-card">
          <div className="ln-cardhead">
            <div className="ln-nav">
              <button className="ln-arrow" onClick={() => shift(-1)} aria-label="Previous">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="ln-navlabel ln-serif">{navLabel}</span>
              <button className="ln-arrow" onClick={() => shift(1)} aria-label="Next">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
            <div className="ln-segs">
              {(['day', 'week', 'month'] as const).map(v => (
                <button key={v} className={`ln-seg${calView === v ? ' on' : ''}`} onClick={() => { setCalView(v); setViewDate(new Date()) }}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {calView === 'day' && <DayView {...gridProps} day={viewDate} bookings={rangeBkgs.filter(b => dateStr(new Date(b.start_time)) === viewDateStr || dateStr(new Date(b.end_time)) === viewDateStr)} />}
          {calView === 'week' && <WeekView {...gridProps} weekStart={weekStart} bookings={rangeBkgs} onOpenDay={openDay} />}
          {calView === 'month' && <MonthView viewDate={viewDate} bookings={rangeBkgs} now={now} calH={fit.calH} onOpenDay={openDay} />}
        </div>

        <div className="ln-foot">
          <span />
          <button className="ln-later ln-serif" onClick={() => openSchedule(calView === 'day' && viewDateStr > todayStr ? viewDateStr : todayStr)}>
            Book for later →
          </button>
        </div>
      </div>

      <div className={`ln-toast ln-serif${toast ? ' show' : ''}${toast?.err ? ' err' : ''}`} role="status" aria-live="polite">{toast?.msg}</div>

      {sched && (
        <ScheduleModal
          roomName={room?.name ?? ''} workspace={workspace} today={todayStr}
          form={sched} onChange={p => { setSched(s => s && { ...s, ...p }); setSchedError(null) }}
          onStartTime={t => setSched(s => s && { ...s, start: t, end: s.end || hourAfter(t) })}
          submitting={submitting} done={schedDone} error={schedError}
          onConfirm={handleScheduleConfirm} onClose={() => { setSched(null); setSchedDone(false) }}
        />
      )}
      {editBooking && (
        <EditModal
          booking={editBooking} roomName={room?.name ?? ''} workspace={workspace}
          form={editForm} onChange={p => setEditForm(f => ({ ...f, ...p }))}
          isOthers={needsReason(editBooking)}
          submitting={editSaving} error={editError}
          onSave={() => handleEditSave()} onCancelBooking={handleEditCancel} onClose={() => setEditBooking(null)}
        />
      )}
      {others && (
        <OthersBookingModal
          key={others.booking.id + others.action}
          booking={others.booking} action={others.action}
          submitting={othersBusy} error={othersError} sent={othersSent}
          onDoNow={(reason, name) => others.action === 'cancel' ? cancelBooking(others.booking, reason, name) : handleEditSave(reason, name)}
          onAsk={sendRequest}
          onClose={() => setOthers(null)}
        />
      )}
      {confirmCancel && (
        <ConfirmCancelModal onYes={confirmCancel} onNo={() => setConfirmCancel(null)} />
      )}
    </div>
  )
}
