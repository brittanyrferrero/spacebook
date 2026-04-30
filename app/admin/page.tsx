'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, subDays } from 'date-fns'

const SAGE = '#5C7A6B'; const SAGE_LIGHT = '#eef7f1'
const NAVY = '#111111'; const NAVY_LIGHT = '#f0f0f0'
const FREE = '#3B7A4A'; const BUSY = '#B94040'
const AMENITIES = ['TV', 'Whiteboard', 'Video conferencing', 'Phone', 'Natural light'] as const

type Preset = '7d' | '30d' | 'month' | 'quarter'
type Nav = 'Overview' | 'Bookings' | 'Rooms' | 'Members' | 'Settings'

const PRESETS: { key: Preset; label: string; days: number }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'month', label: 'This month', days: 0 },
  { key: 'quarter', label: 'Quarter', days: 90 },
]

function getRange(preset: Preset): { from: string; to: string } {
  const today = new Date()
  const to = format(today, 'yyyy-MM-dd')
  if (preset === 'month') {
    return { from: format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'), to }
  }
  const p = PRESETS.find(p => p.key === preset)!
  return { from: format(subDays(today, p.days - 1), 'yyyy-MM-dd'), to }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AdminPage() {
  const [preset, setPreset] = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [nav, setNav] = useState<Nav>('Overview')

  // Bookings tab
  const [bookings, setBookings] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCancelling, setBulkCancelling] = useState(false)
  const [sortCol, setSortCol] = useState<'room' | 'booker' | 'email' | 'purpose' | 'date'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Rooms tab
  const [allRooms, setAllRooms] = useState<any[]>([])
  const [editingRoom, setEditingRoom] = useState<any>(null)
  const [editDraft, setEditDraft] = useState<any>(null)
  const [roomSaving, setRoomSaving] = useState(false)
  const [addingRoom, setAddingRoom] = useState(false)
  const [newDraft, setNewDraft] = useState({ name: '', capacity: '4', amenities: [] as string[] })
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null)

  // Members tab
  const [members, setMembers] = useState<any[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberAdding, setMemberAdding] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [memberSortCol, setMemberSortCol] = useState<'name' | 'email' | 'joined' | 'last_used'>('name')
  const [memberSortDir, setMemberSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [bulkRemovingMembers, setBulkRemovingMembers] = useState(false)

  // Overview filters
  const [filterRoom, setFilterRoom] = useState<string>('')
  const [filterRoomBookings, setFilterRoomBookings] = useState<string>('')
  const [overviewRooms, setOverviewRooms] = useState<any[]>([])

  const { from, to } = (customFrom && customTo) ? { from: customFrom, to: customTo } : getRange(preset)

  useEffect(() => {
    fetch('/api/rooms?all=1').then(r => r.json()).then(setOverviewRooms)
  }, [])

  useEffect(() => {
    const url = `/api/admin/stats?from=${from}&to=${to}${filterRoom ? `&room_id=${filterRoom}` : ''}`
    fetch(url).then(r => r.json()).then(setStats)
  }, [from, to, filterRoom])

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true)
    const [bRes, rRes] = await Promise.all([
      fetch(`/api/bookings?from=${from}&to=${to}`),
      fetch('/api/rooms?all=1'),
    ])
    const [bData, rData] = await Promise.all([bRes.json(), rRes.json()])
    setBookings(bData)
    setRooms(rData)
    setSelected(new Set())
    setBookingsLoading(false)
  }, [from, to])

  const fetchAllRooms = useCallback(async () => {
    const res = await fetch('/api/rooms?all=1')
    setAllRooms(await res.json())
  }, [])

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true)
    const res = await fetch('/api/members')
    setMembers(await res.json())
    setMembersLoading(false)
  }, [])

  useEffect(() => {
    if (nav === 'Bookings') fetchBookings()
    if (nav === 'Rooms') fetchAllRooms()
    if (nav === 'Members') fetchMembers()
  }, [nav, fetchBookings, fetchAllRooms, fetchMembers])

  function roomName(roomId: string) {
    return rooms.find((r: any) => r.id === roomId)?.name ?? roomId
  }

  function exportCSV() {
    const header = ['Room', 'Booker', 'Email', 'Title', 'Date', 'Start', 'End']
    const rows = bookings.map((b: any) => [
      roomName(b.room_id),
      b.booker_name,
      b.booker_email,
      b.title ?? '',
      fmtDate(b.start_time),
      fmtTime(b.start_time),
      fmtTime(b.end_time),
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `bookings-${from}-${to}.csv`; a.click()
  }

  // Sort
  function handleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const sortIndicator = (col: typeof sortCol) => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  function sortedBookings() {
    const filtered = filterRoomBookings ? bookings.filter((b: any) => b.room_id === filterRoomBookings) : bookings
    return [...filtered].sort((a, b) => {
      let av: string, bv: string
      if (sortCol === 'room')    { av = roomName(a.room_id); bv = roomName(b.room_id) }
      else if (sortCol === 'booker')  { av = a.booker_name; bv = b.booker_name }
      else if (sortCol === 'email')   { av = a.booker_email; bv = b.booker_email }
      else if (sortCol === 'purpose') { av = a.title ?? ''; bv = b.title ?? '' }
      else                            { av = a.start_time; bv = b.start_time }
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }

  // Single cancel — opens modal for scope if recurring
  const [cancelModal, setCancelModal] = useState<{ booking: any; scope: 'this' | 'future' | 'all' } | null>(null)

  async function doCancel(booking: any, scope: 'this' | 'future' | 'all') {
    setCancellingId(booking.id)
    setCancelModal(null)
    await fetch(`/api/cancel/${booking.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) })
    await fetchBookings()
    setCancellingId(null)
  }

  // Bulk cancel — always scope 'this' per occurrence
  async function cancelSelected() {
    const count = selected.size
    if (!confirm(`Cancel ${count} booking${count > 1 ? 's' : ''}? For recurring bookings, only these specific occurrences will be cancelled.`)) return
    setBulkCancelling(true)
    const toCancel = bookings.filter(b => selected.has(b.id))
    await Promise.all(toCancel.map(b =>
      fetch(`/api/cancel/${b.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'this' }) })
    ))
    await fetchBookings()
    setBulkCancelling(false)
  }

  async function toggleRoom(room: any) {
    await fetch(`/api/rooms/${room.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !room.is_active }),
    })
    fetchAllRooms()
    if (nav === 'Overview') fetch(`/api/admin/stats?from=${from}&to=${to}`).then(r => r.json()).then(setStats)
  }

  async function saveRoom() {
    setRoomSaving(true)
    await fetch(`/api/rooms/${editingRoom.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editDraft.name, capacity: Number(editDraft.capacity), amenities: editDraft.amenities }),
    })
    setEditingRoom(null)
    setEditDraft(null)
    setRoomSaving(false)
    fetchAllRooms()
  }

  async function addRoom() {
    setRoomSaving(true)
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDraft.name, capacity: Number(newDraft.capacity), amenities: newDraft.amenities }),
    })
    setAddingRoom(false)
    setNewDraft({ name: '', capacity: '4', amenities: [] })
    setRoomSaving(false)
    fetchAllRooms()
  }

  async function deleteRoomById(room: any) {
    const bookingWarning = room._hasBookings ? ' This room has upcoming bookings — they will remain but the room will be hidden.' : ''
    if (!confirm(`Delete "${room.name}"?${bookingWarning}`)) return
    setDeletingRoomId(room.id)
    const res = await fetch(`/api/rooms/${room.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.hasBookings) {
      // Room deleted but had bookings — just refresh
    }
    setDeletingRoomId(null)
    fetchAllRooms()
  }

  async function addMemberSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMemberError('')
    setMemberAdding(true)
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: memberName.trim(), email: memberEmail.trim().toLowerCase() }),
    })
    const data = await res.json()
    if (!res.ok) { setMemberError(data.error ?? 'Failed to add member.'); setMemberAdding(false); return }
    setMemberName(''); setMemberEmail(''); setMemberAdding(false)
    fetchMembers()
  }

  async function removeMemberById(id: string) {
    setRemovingMemberId(id)
    await fetch(`/api/members/${id}`, { method: 'DELETE' })
    setRemovingMemberId(null)
    fetchMembers()
  }

  async function bulkRemoveMembers() {
    const count = selectedMembers.size
    if (!confirm(`Remove ${count} member${count > 1 ? 's' : ''}?`)) return
    setBulkRemovingMembers(true)
    await Promise.all([...selectedMembers].map(id => fetch(`/api/members/${id}`, { method: 'DELETE' })))
    setSelectedMembers(new Set())
    setBulkRemovingMembers(false)
    fetchMembers()
  }

  function sortedMembers() {
    return [...members].sort((a, b) => {
      let av: string, bv: string
      if (memberSortCol === 'name')      { av = a.name;      bv = b.name }
      else if (memberSortCol === 'email') { av = a.email;     bv = b.email }
      else if (memberSortCol === 'joined'){ av = a.added_at;  bv = b.added_at }
      else                               { av = a.last_used ?? ''; bv = b.last_used ?? '' }
      return memberSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }

  function handleMemberSort(col: typeof memberSortCol) {
    if (memberSortCol === col) setMemberSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setMemberSortCol(col); setMemberSortDir('asc') }
  }
  const mSortIndicator = (col: typeof memberSortCol) => memberSortCol === col ? (memberSortDir === 'asc' ? ' ↑' : ' ↓') : ''

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/admin'
  }

  if (!stats) return (
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
    </div>
  )

  const { totals, roomStats, hourStats } = stats
  const maxRoomBookings = Math.max(...roomStats.map((r: any) => r.total_bookings), 1)
  const maxHour = Math.max(...hourStats.map((h: any) => h.total_bookings), 1)

  const inp: React.CSSProperties = { fontSize: 13, padding: '5px 8px', border: '1px solid #cccccc', borderRadius: 0, outline: 'none', fontFamily: 'inherit', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 11, color: '#6B7280', fontWeight: 500, display: 'block', marginBottom: 3 }
  const showDateRange = nav === 'Overview' || nav === 'Bookings'
  const fmtJoined = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      {/* Top bar */}
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap');` }} />
      <div style={{ background: '#fff', borderBottom: '1px solid #cccccc', padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: NAVY, fontFamily: "'Spectral', Georgia, serif", letterSpacing: '0.02em' }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>{' '}
          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400, fontStyle: 'normal', fontFamily: 'inherit' }}>admin</span>
        </div>
        {showDateRange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => { setPreset(p.key); setShowCustom(false); setCustomFrom(''); setCustomTo('') }}
                style={{ fontSize: 12, padding: '5px 10px', borderRadius: 0, border: `1px solid ${preset === p.key && !customFrom ? NAVY : '#cccccc'}`, background: preset === p.key && !customFrom ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: preset === p.key && !customFrom ? NAVY : '#6B7280' }}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setShowCustom(c => !c)}
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 0, border: `1px solid ${customFrom ? NAVY : '#cccccc'}`, background: customFrom ? NAVY : showCustom ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: customFrom ? '#fff' : NAVY }}>
              Custom range
            </button>
            {showCustom && (
              <div style={{ position: 'absolute', top: 36, right: 0, background: '#fff', border: '1px solid #cccccc', borderRadius: 0, padding: 14, width: 280, zIndex: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: NAVY, marginBottom: 10 }}>Custom date range</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div><label style={lbl}>From</label><input type="date" style={inp} value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></div>
                  <div><label style={lbl}>To</label><input type="date" style={inp} value={customTo} onChange={e => setCustomTo(e.target.value)} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button onClick={() => { setShowCustom(false); setCustomFrom(''); setCustomTo('') }} style={{ background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#6B7280' }}>Cancel</button>
                  <button onClick={() => setShowCustom(false)} style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 0, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>Apply</button>
                </div>
              </div>
            )}
          </div>
        )}
        {nav === 'Bookings' && (
          <button onClick={exportCSV} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 0, border: 'none', background: SAGE, color: '#fff', cursor: 'pointer' }}>
            Export CSV
          </button>
        )}
        {(nav === 'Rooms' || nav === 'Members' || nav === 'Settings') && <div />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', minHeight: 'calc(100vh - 46px)' }}>
        {/* Sidebar */}
        <div style={{ background: '#fff', borderRight: '1px solid #cccccc', padding: 12 }}>
          {(['Overview', 'Bookings', 'Rooms', 'Members', 'Settings'] as Nav[]).map(item => (
            <div key={item} onClick={() => setNav(item)}
              style={{ fontSize: 13, padding: '7px 9px', borderRadius: 0, cursor: 'pointer', color: nav === item ? '#374151' : '#6B7280', background: nav === item ? '#f0f0f0' : 'transparent', marginBottom: 2 }}>
              {item}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ padding: '16px 18px' }}>

          {/* ── Overview ── */}
          {nav === 'Overview' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>Showing data for</span>
                <span style={{ fontSize: 12, color: NAVY, background: NAVY_LIGHT, padding: '3px 10px', borderRadius: 0, fontWeight: 500 }}>
                  {customFrom ? `${customFrom} – ${customTo}` : PRESETS.find(p => p.key === preset)?.label}
                </span>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>·</span>
                <button onClick={() => setFilterRoom('')}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 0, border: `1px solid ${!filterRoom ? NAVY : '#cccccc'}`, background: !filterRoom ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: !filterRoom ? NAVY : '#6B7280' }}>
                  All rooms
                </button>
                {overviewRooms.map((r: any) => (
                  <button key={r.id} onClick={() => setFilterRoom(r.id)}
                    style={{ fontSize: 12, padding: '3px 10px', borderRadius: 0, border: `1px solid ${filterRoom === r.id ? NAVY : '#cccccc'}`, background: filterRoom === r.id ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: filterRoom === r.id ? NAVY : '#6B7280' }}>
                    {r.name}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14, maxWidth: 480 }}>
                {[
                  { label: 'Total bookings', value: totals.total_bookings },
                  { label: 'Hours booked', value: totals.total_hours },
                  { label: 'Avg. duration', value: `${totals.avg_duration}h` },
                  { label: 'Utilisation', value: `${totals.utilisation_pct}%` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: '#fff', borderRadius: 0, padding: 11, border: '1px solid #dddddd' }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 21, fontWeight: 500, color: NAVY }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                {!filterRoom && (
                  <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 13 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 10 }}>Bookings by room</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 80 }}>
                      {roomStats.map((r: any) => {
                        const h = Math.round(r.total_bookings / maxRoomBookings * 75)
                        return (
                          <div key={r.room.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                            <div title={`${r.total_bookings} bookings`} style={{ borderRadius: '3px 3px 0 0', width: '100%', height: h, background: r.room.is_active ? SAGE : '#C8D8CC' }} />
                            <div style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center' }}>{r.room.name.split(' ').pop()}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 13 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 10 }}>Busiest hours</div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hourStats.length},1fr)`, gap: 2, marginBottom: 3 }}>
                    {hourStats.map((h: any) => (
                      <div key={h.hour} title={`${h.hour}:00 – ${h.total_bookings} bookings`}
                        style={{ height: 20, borderRadius: 3, background: NAVY, opacity: 0.12 + 0.88 * (h.total_bookings / maxHour) }} />
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hourStats.length},1fr)`, gap: 2 }}>
                    {hourStats.map((h: any) => (
                      <div key={h.hour} style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center' }}>
                        {h.hour >= 12 ? `${h.hour === 12 ? 12 : h.hour - 12}p` : `${h.hour}a`}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 13 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 10 }}>Busiest days</div>
                  {(() => {
                    const dowStats: any[] = stats.dowStats ?? []
                    const maxDow = Math.max(...dowStats.map((d: any) => d.total_bookings), 1)
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 3 }}>
                          {dowStats.map((d: any) => (
                            <div key={d.dow} title={`${d.label} – ${d.total_bookings} bookings`}
                              style={{ height: 20, borderRadius: 3, background: SAGE, opacity: 0.12 + 0.88 * (d.total_bookings / maxDow) }} />
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                          {dowStats.map((d: any) => (
                            <div key={d.dow} style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center' }}>{d.label}</div>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            </>
          )}

          {/* ── Bookings ── */}
          {nav === 'Bookings' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>Showing bookings for</span>
                <span style={{ fontSize: 12, color: NAVY, background: NAVY_LIGHT, padding: '3px 10px', borderRadius: 0, fontWeight: 500 }}>
                  {customFrom ? `${customFrom} – ${customTo}` : PRESETS.find(p => p.key === preset)?.label}
                </span>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>·</span>
                <button onClick={() => setFilterRoomBookings('')}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 0, border: `1px solid ${!filterRoomBookings ? NAVY : '#cccccc'}`, background: !filterRoomBookings ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: !filterRoomBookings ? NAVY : '#6B7280' }}>
                  All rooms
                </button>
                {overviewRooms.map((r: any) => (
                  <button key={r.id} onClick={() => setFilterRoomBookings(r.id)}
                    style={{ fontSize: 12, padding: '3px 10px', borderRadius: 0, border: `1px solid ${filterRoomBookings === r.id ? NAVY : '#cccccc'}`, background: filterRoomBookings === r.id ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: filterRoomBookings === r.id ? NAVY : '#6B7280' }}>
                    {r.name}
                  </button>
                ))}
                {!bookingsLoading && <span style={{ fontSize: 12, color: '#9CA3AF' }}>· {bookings.filter((b: any) => !filterRoomBookings || b.room_id === filterRoomBookings).length} booking{bookings.filter((b: any) => !filterRoomBookings || b.room_id === filterRoomBookings).length !== 1 ? 's' : ''}</span>}
                {selected.size > 0 && (
                  <button onClick={cancelSelected} disabled={bulkCancelling}
                    style={{ marginLeft: 8, fontSize: 12, padding: '4px 12px', borderRadius: 0, border: '1px solid #F0CACA', background: '#FEF2F2', color: BUSY, cursor: 'pointer' }}>
                    {bulkCancelling ? 'Cancelling…' : `Cancel ${selected.size} selected`}
                  </button>
                )}
              </div>

              {bookingsLoading ? (
                <div style={{ color: '#9CA3AF', fontSize: 13, padding: '20px 0' }}>Loading…</div>
              ) : bookings.length === 0 ? (
                <div style={{ color: '#9CA3AF', fontSize: 13, padding: '20px 0' }}>No bookings in this period.</div>
              ) : (
                <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#ffffff', padding: '8px 12px', borderBottom: '1px solid #dddddd', width: 32 }}>
                          <input type="checkbox"
                            checked={selected.size === bookings.length && bookings.length > 0}
                            ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < bookings.length }}
                            onChange={e => setSelected(e.target.checked ? new Set(bookings.map((b: any) => b.id)) : new Set())}
                          />
                        </th>
                        {([['Room', 'room'], ['Booker', 'booker'], ['Email', 'email'], ['Purpose', 'purpose'], ['Date', 'date'], ['Time', 'date'], ['', null]] as [string, string | null][]).map(([label, col]) => (
                          <th key={label} onClick={col ? () => handleSort(col as any) : undefined}
                            style={{ background: '#ffffff', padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: col ? NAVY : '#9CA3AF', borderBottom: '1px solid #dddddd', whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none' }}>
                            {label}{col ? sortIndicator(col as any) : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBookings().map((b: any) => {
                        const isSelected = selected.has(b.id)
                        const isRecurring = !!b.recurring_series_id
                        return (
                          <tr key={b.id} style={{ background: isSelected ? '#F0F4FF' : 'transparent' }}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                              <input type="checkbox" checked={isSelected}
                                onChange={e => setSelected(prev => { const s = new Set(prev); e.target.checked ? s.add(b.id) : s.delete(b.id); return s })} />
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#374151', fontWeight: 500 }}>{roomName(b.room_id)}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#374151' }}>{b.booker_name}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF' }}>{b.booker_email}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF' }}>{b.title ?? '—'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#374151', whiteSpace: 'nowrap' }}>
                              {fmtDate(b.start_time)}
                              {isRecurring && <span style={{ marginLeft: 6, fontSize: 10, color: SAGE, background: SAGE_LIGHT, padding: '1px 5px', borderRadius: 0 }}>recurring</span>}
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#374151', whiteSpace: 'nowrap' }}>{fmtTime(b.start_time)} – {fmtTime(b.end_time)}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                              <button
                                disabled={cancellingId === b.id}
                                onClick={() => isRecurring ? setCancelModal({ booking: b, scope: 'this' }) : doCancel(b, 'this')}
                                style={{ fontSize: 11, padding: '3px 7px', borderRadius: 0, border: '1px solid #F0CACA', background: 'none', cursor: 'pointer', color: BUSY }}>
                                {cancellingId === b.id ? '…' : 'Cancel'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Recurring cancel modal */}
              {cancelModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                  <div style={{ background: '#fff', borderRadius: 0, padding: 24, width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: NAVY, marginBottom: 6 }}>Cancel recurring booking</div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
                      {cancelModal.booking.booker_name} · {roomName(cancelModal.booking.room_id)} · {fmtDate(cancelModal.booking.start_time)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                      {([['this', 'Just this occurrence'], ['future', 'This and all future occurrences'], ['all', 'All occurrences in the series']] as const).map(([scope, label]) => (
                        <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 0, border: `1px solid ${cancelModal.scope === scope ? NAVY : '#cccccc'}`, background: cancelModal.scope === scope ? NAVY_LIGHT : '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                          <input type="radio" name="scope" value={scope} checked={cancelModal.scope === scope} onChange={() => setCancelModal(m => m ? { ...m, scope } : null)} />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setCancelModal(null)}
                        style={{ flex: 1, background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: '8px 0', fontSize: 13, cursor: 'pointer', color: '#6B7280' }}>
                        Keep
                      </button>
                      <button onClick={() => doCancel(cancelModal.booking, cancelModal.scope)}
                        style={{ flex: 1, background: BUSY, color: '#fff', border: 'none', borderRadius: 0, padding: '8px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        Cancel booking
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Rooms ── */}
          {nav === 'Rooms' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Rooms</span>
                <button onClick={() => setAddingRoom(true)}
                  style={{ fontSize: 12, padding: '6px 12px', borderRadius: 0, border: 'none', background: SAGE, color: '#fff', cursor: 'pointer' }}>
                  + Add room
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allRooms.map((r: any) => (
                  <div key={r.id} style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: r.is_active ? '#374151' : '#9CA3AF' }}>{r.name}</span>
                        {!r.is_active && <span style={{ fontSize: 11, color: '#9CA3AF', background: '#f0f0f0', padding: '1px 6px', borderRadius: 0 }}>inactive</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                        {r.capacity} people · {r.amenities.length > 0 ? r.amenities.join(', ') : 'No amenities listed'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div onClick={() => toggleRoom(r)} title={r.is_active ? 'Deactivate room' : 'Activate room'}
                        style={{ width: 30, height: 17, borderRadius: 9, background: r.is_active ? SAGE : '#C8CDD4', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', width: 11, height: 11, borderRadius: '50%', background: '#fff', top: 3, left: r.is_active ? 16 : 3, transition: 'left .2s' }} />
                      </div>
                      <button onClick={() => { setEditingRoom(r); setEditDraft({ name: r.name, capacity: r.capacity, amenities: [...r.amenities] }) }}
                        style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: '1px solid #cccccc', background: 'none', cursor: 'pointer', color: '#6B7280' }}>
                        Edit
                      </button>
                      <button onClick={() => deleteRoomById(r)} disabled={deletingRoomId === r.id}
                        style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: '1px solid #F0CACA', background: 'none', cursor: 'pointer', color: BUSY }}>
                        {deletingRoomId === r.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Edit modal */}
              {editingRoom && editDraft && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                  <div style={{ background: '#fff', borderRadius: 0, padding: 24, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: NAVY, marginBottom: 16 }}>Edit room</div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Room name</label>
                      <input style={{ ...inp, width: '100%' }} value={editDraft.name} onChange={e => setEditDraft((d: any) => ({ ...d, name: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Capacity</label>
                      <input style={{ ...inp, width: '80px' }} type="number" min={1} value={editDraft.capacity} onChange={e => setEditDraft((d: any) => ({ ...d, capacity: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={lbl}>Amenities</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {AMENITIES.map(a => {
                          const on = editDraft.amenities.includes(a)
                          return (
                            <button key={a} type="button"
                              onClick={() => setEditDraft((d: any) => ({ ...d, amenities: on ? d.amenities.filter((x: string) => x !== a) : [...d.amenities, a] }))}
                              style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: `1px solid ${on ? SAGE : '#cccccc'}`, background: on ? SAGE_LIGHT : '#fff', color: on ? SAGE : '#6B7280', cursor: 'pointer' }}>
                              {a}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setEditingRoom(null); setEditDraft(null) }}
                        style={{ flex: 1, background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: '8px 0', fontSize: 13, cursor: 'pointer', color: '#6B7280' }}>
                        Cancel
                      </button>
                      <button onClick={saveRoom} disabled={roomSaving || !editDraft.name}
                        style={{ flex: 1, background: SAGE, color: '#fff', border: 'none', borderRadius: 0, padding: '8px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        {roomSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Add room modal */}
              {addingRoom && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                  <div style={{ background: '#fff', borderRadius: 0, padding: 24, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: NAVY, marginBottom: 16 }}>Add room</div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Room name</label>
                      <input autoFocus style={{ ...inp, width: '100%' }} placeholder="e.g. The Garden" value={newDraft.name} onChange={e => setNewDraft(d => ({ ...d, name: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Capacity</label>
                      <input style={{ ...inp, width: '80px' }} type="number" min={1} value={newDraft.capacity} onChange={e => setNewDraft(d => ({ ...d, capacity: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={lbl}>Amenities</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {AMENITIES.map(a => {
                          const on = newDraft.amenities.includes(a)
                          return (
                            <button key={a} type="button"
                              onClick={() => setNewDraft(d => ({ ...d, amenities: on ? d.amenities.filter(x => x !== a) : [...d.amenities, a] }))}
                              style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: `1px solid ${on ? SAGE : '#cccccc'}`, background: on ? SAGE_LIGHT : '#fff', color: on ? SAGE : '#6B7280', cursor: 'pointer' }}>
                              {a}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setAddingRoom(false); setNewDraft({ name: '', capacity: '4', amenities: [] }) }}
                        style={{ flex: 1, background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: '8px 0', fontSize: 13, cursor: 'pointer', color: '#6B7280' }}>
                        Cancel
                      </button>
                      <button onClick={addRoom} disabled={roomSaving || !newDraft.name}
                        style={{ flex: 1, background: SAGE, color: '#fff', border: 'none', borderRadius: 0, padding: '8px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        {roomSaving ? 'Adding…' : 'Add room'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Members ── */}
          {nav === 'Members' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                  Members {!membersLoading && <span style={{ fontSize: 12, fontWeight: 400, color: '#9CA3AF' }}>· {members.length}</span>}
                </span>
                {selectedMembers.size > 0 && (
                  <button onClick={bulkRemoveMembers} disabled={bulkRemovingMembers}
                    style={{ fontSize: 12, padding: '4px 12px', borderRadius: 0, border: '1px solid #F0CACA', background: '#FEF2F2', color: BUSY, cursor: 'pointer' }}>
                    {bulkRemovingMembers ? 'Removing…' : `Remove ${selectedMembers.size} selected`}
                  </button>
                )}
              </div>

              {/* Inline add form */}
              <form onSubmit={addMemberSubmit} style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <label style={lbl}>Name</label>
                  <input style={{ ...inp, width: 160 }} placeholder="Full name" value={memberName} onChange={e => setMemberName(e.target.value)} required />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input style={{ ...inp, width: 200 }} type="email" placeholder="email@example.com" value={memberEmail} onChange={e => setMemberEmail(e.target.value)} required />
                </div>
                <button type="submit" disabled={memberAdding || !memberName.trim() || !memberEmail.trim()}
                  style={{ fontSize: 12, padding: '6px 14px', borderRadius: 0, border: 'none', background: SAGE, color: '#fff', cursor: 'pointer', opacity: memberAdding ? 0.7 : 1 }}>
                  {memberAdding ? 'Adding…' : '+ Add member'}
                </button>
                {memberError && <span style={{ fontSize: 12, color: BUSY, alignSelf: 'center' }}>{memberError}</span>}
              </form>

              {membersLoading ? (
                <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
              ) : members.length === 0 ? (
                <div style={{ color: '#9CA3AF', fontSize: 13 }}>No members yet.</div>
              ) : (
                <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#ffffff', padding: '8px 12px', borderBottom: '1px solid #dddddd', width: 32 }}>
                          <input type="checkbox"
                            checked={selectedMembers.size === members.length && members.length > 0}
                            ref={el => { if (el) el.indeterminate = selectedMembers.size > 0 && selectedMembers.size < members.length }}
                            onChange={e => setSelectedMembers(e.target.checked ? new Set(members.map((m: any) => m.id)) : new Set())}
                          />
                        </th>
                        {([['Name', 'name'], ['Email', 'email'], ['Joined', 'joined'], ['Last used', 'last_used'], ['', null]] as [string, string | null][]).map(([label, col]) => (
                          <th key={label} onClick={col ? () => handleMemberSort(col as any) : undefined}
                            style={{ background: '#ffffff', padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: col ? NAVY : '#9CA3AF', borderBottom: '1px solid #dddddd', whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none' }}>
                            {label}{col ? mSortIndicator(col as any) : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMembers().map((m: any) => {
                        const isSelected = selectedMembers.has(m.id)
                        return (
                          <tr key={m.id} style={{ background: isSelected ? '#F0F4FF' : 'transparent' }}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                              <input type="checkbox" checked={isSelected}
                                onChange={e => setSelectedMembers(prev => { const s = new Set(prev); e.target.checked ? s.add(m.id) : s.delete(m.id); return s })} />
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#374151', fontWeight: 500 }}>{m.name}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF' }}>{m.email}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{fmtJoined(m.added_at)}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{m.last_used ? fmtDate(m.last_used) : '—'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                              <button onClick={() => removeMemberById(m.id)} disabled={removingMemberId === m.id}
                                style={{ fontSize: 11, padding: '3px 7px', borderRadius: 0, border: '1px solid #F0CACA', background: 'none', cursor: 'pointer', color: BUSY }}>
                                {removingMemberId === m.id ? '…' : 'Remove'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Settings ── */}
          {nav === 'Settings' && (
            <div style={{ maxWidth: 400 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 16 }}>Settings</div>

              <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 16, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Admin password</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>Set via the <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 4 }}>ADMIN_PASSWORD</code> environment variable.</div>
                <button onClick={logout}
                  style={{ fontSize: 12, padding: '7px 14px', borderRadius: 0, border: '1px solid #F0CACA', background: 'none', cursor: 'pointer', color: BUSY }}>
                  Sign out
                </button>
              </div>

              <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>User directory</div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                  Name/email autocomplete is populated from <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 4 }}>public/users.json</code>.
                  Replace this file with your Slack export (array of <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 4 }}>{`{name, email}`}</code> objects).
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
