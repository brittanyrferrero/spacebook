'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { format, subDays, addDays } from 'date-fns'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const SAGE = '#5C7A6B'; const SAGE_LIGHT = '#eef7f1'
const NAVY = '#111111'; const NAVY_LIGHT = '#f0f0f0'
const FREE = '#3B7A4A'; const BUSY = '#B94040'

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
  const to = format(addDays(today, 30), 'yyyy-MM-dd')
  if (preset === 'month') {
    return { from: format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'), to }
  }
  const p = PRESETS.find(p => p.key === preset)!
  return { from: format(subDays(today, p.days - 1), 'yyyy-MM-dd'), to }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtActivity(iso: string | null): { label: string; color: string } {
  if (!iso) return { label: '—', color: '#D1D5DB' }
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000
  if (days <= 7)  return { label: 'Past week',    color: '#2d7044' }
  if (days <= 30) return { label: 'Past 30 days', color: '#5C7A6B' }
  if (days <= 90) return { label: 'Past 90 days', color: '#9CA3AF' }
  if (days <= 365) return { label: 'Past year',   color: '#9CA3AF' }
  return { label: 'Dormant', color: '#D1D5DB' }
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function SortableRoomItem({ id, children }: { id: string; children: (dragHandleProps: React.HTMLAttributes<HTMLDivElement>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }}>
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

export default function AdminPage() {
  const { workspace } = useParams<{ workspace: string }>()
  const api = `/api/${workspace}`
  const [preset, setPreset] = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [nav, setNav] = useState<Nav>('Overview')
  const [myRole, setMyRole] = useState<'admin' | 'super_admin' | null>(null)
  const [adminList, setAdminList] = useState<{ email: string; role: string }[]>([])
  const [adminEntryToken, setAdminEntryToken] = useState<string | null>(null)

  // Bookings tab
  const [bookings, setBookings] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCancelling, setBulkCancelling] = useState(false)
  const [bulkCancelConfirm, setBulkCancelConfirm] = useState(false)
  const [sortCol, setSortCol] = useState<'room' | 'booker' | 'email' | 'purpose' | 'date'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Rooms tab
  const [allRooms, setAllRooms] = useState<any[]>([])
  const [editingRoom, setEditingRoom] = useState<any>(null)
  const [editDraft, setEditDraft] = useState<any>(null)
  const [roomSaving, setRoomSaving] = useState(false)
  const [addingRoom, setAddingRoom] = useState(false)
  const [newDraft, setNewDraft] = useState({ name: '', room_type: '', capacity: '4', amenities: [] as string[] })
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null)
  const [disconnectingRoomId, setDisconnectingRoomId] = useState<string | null>(null)
  const [gcalToast, setGcalToast] = useState<string | null>(null)
  const gcalToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [gcalPickRoomId, setGcalPickRoomId] = useState<string | null>(null)
  const [gcalCalendars, setGcalCalendars] = useState<{ id: string; summary: string; primary: boolean; backgroundColor?: string }[]>([])
  const [gcalPickLoading, setGcalPickLoading] = useState(false)
  const [gcalPickSaving, setGcalPickSaving] = useState(false)
  const [copiedTabletRoomId, setCopiedTabletRoomId] = useState<string | null>(null)

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
  const [memberSearch, setMemberSearch] = useState('')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editMemberDraft, setEditMemberDraft] = useState({ name: '', email: '' })
  const [memberEditSaving, setMemberEditSaving] = useState(false)
  const [memberEditError, setMemberEditError] = useState('')
  const [batchAddOpen, setBatchAddOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchAdding, setBatchAdding] = useState(false)
  const [batchResult, setBatchResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null)

  // Workspace name
  const [wsName, setWsName] = useState('')
  const [wsNameSaving, setWsNameSaving] = useState(false)
  const [wsNameSaved, setWsNameSaved] = useState(false)

  // Display hours (calendar grid range)
  const [dispStart, setDispStart] = useState(8)
  const [dispEnd,   setDispEnd]   = useState(20)
  const [dispSaving, setDispSaving] = useState(false)
  const [dispSaved,  setDispSaved]  = useState(false)

  // Booking hours (full data-collection range, wider than display)
  const [bhStart, setBhStart] = useState(6)
  const [bhEnd,   setBhEnd]   = useState(22)
  const [bhSaving, setBhSaving] = useState(false)
  const [bhSaved,  setBhSaved]  = useState(false)

  // Booking visibility
  const [visShowTitle,     setVisShowTitle]     = useState(false)
  const [visShowOrganizer, setVisShowOrganizer] = useState(false)
  const [visSaving,        setVisSaving]        = useState(false)
  const [visSaved,         setVisSaved]         = useState(false)

  // Overview filters
  const [filterRoom, setFilterRoom] = useState<string>('')
  const [filterRoomType, setFilterRoomType] = useState<string>('')
  const [filterRoomBookings, setFilterRoomBookings] = useState<string>('')
  const [overviewRooms, setOverviewRooms] = useState<any[]>([])

  // Room types
  const [roomTypes, setRoomTypes] = useState<string[]>([])
  const [newTypeText, setNewTypeText] = useState('')
  const [typeAdding, setTypeAdding] = useState(false)
  const [typeError, setTypeError] = useState('')
  const [deletingType, setDeletingType] = useState<string | null>(null)

  // Amenity options
  const [amenityOptions, setAmenityOptions] = useState<string[]>([])
  const [newAmenityText, setNewAmenityText] = useState('')
  const [amenityAdding, setAmenityAdding] = useState(false)
  const [amenityError, setAmenityError] = useState('')
  const [deletingAmenity, setDeletingAmenity] = useState<string | null>(null)

  // Workspace deletion request
  const [deleteReqEmail, setDeleteReqEmail] = useState('')
  const [deleteReqSending, setDeleteReqSending] = useState(false)
  const [deleteReqSent, setDeleteReqSent] = useState(false)
  const [deleteReqError, setDeleteReqError] = useState('')

  const { from, to } = (customFrom && customTo) ? { from: customFrom, to: customTo } : getRange(preset)

  useEffect(() => {
    fetch(`${api}/admin/admins`).then(r => r.json()).then((res: any) => {
      const list = res.admins ?? res
      setAdminList(list)
      if (res.myRole) {
        setMyRole(res.myRole)
      } else {
        try {
          const saved = localStorage.getItem('spacebook_user')
          if (saved) {
            const email = JSON.parse(saved).email?.toLowerCase()
            const me = list.find((a: any) => a.email.toLowerCase() === email)
            setMyRole(me?.role ?? null)
          }
        } catch {}
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${api}/rooms?all=1`).then(r => r.json()).then(setOverviewRooms)
    fetch(`${api}/room-types`).then(r => r.json()).then(setRoomTypes)
    fetch(`${api}/amenities`).then(r => r.json()).then(setAmenityOptions)
    fetch(`${api}/settings`).then(r => r.json()).then(d => {
      setDispStart(d.displayHours?.start ?? 8)
      setDispEnd(d.displayHours?.end ?? 20)
      setBhStart(d.bookingHours?.start ?? 6)
      setBhEnd(d.bookingHours?.end ?? 22)
      setVisShowTitle(d.bookingVisibility?.showTitle ?? false)
      setVisShowOrganizer(d.bookingVisibility?.showOrganizer ?? false)
      if (d.adminEntryToken) setAdminEntryToken(d.adminEntryToken)
      if (d.workspaceName != null) setWsName(d.workspaceName)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let url = `${api}/admin/stats?from=${from}&to=${to}`
    if (filterRoom) url += `&room_id=${filterRoom}`
    else if (filterRoomType) url += `&room_type=${encodeURIComponent(filterRoomType)}`
    fetch(url).then(r => r.json()).then(setStats)
  }, [from, to, filterRoom, filterRoomType])

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true)
    const [bRes, rRes] = await Promise.all([
      fetch(`${api}/bookings?from=${from}&to=${to}`),
      fetch(`${api}/rooms?all=1`),
    ])
    const [bData, rData] = await Promise.all([bRes.json(), rRes.json()])
    setBookings(bData)
    setRooms(rData)
    setSelected(new Set())
    setBookingsLoading(false)
  }, [from, to])

  const fetchAllRooms = useCallback(async () => {
    const res = await fetch(`${api}/rooms?all=1`)
    const data = await res.json()
    setAllRooms([...data].sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)))
  }, [])

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleRoomDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = allRooms.findIndex((r: any) => r.id === active.id)
    const newIndex = allRooms.findIndex((r: any) => r.id === over.id)
    const reordered = arrayMove(allRooms, oldIndex, newIndex)
    setAllRooms(reordered)
    await Promise.all(reordered.map((r: any, i: number) =>
      fetch(`${api}/rooms/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_order: i }) })
    ))
  }

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true)
    const res = await fetch(`${api}/members`)
    setMembers(await res.json())
    setMembersLoading(false)
  }, [])

  useEffect(() => {
    if (nav === 'Bookings') fetchBookings()
    if (nav === 'Rooms') fetchAllRooms()
    if (nav === 'Members') fetchMembers()
  }, [nav, fetchBookings, fetchAllRooms, fetchMembers])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    const gcal = params.get('gcal')
    if (tab === 'Rooms') setNav('Rooms')
    if (gcal === 'pick') {
      const roomId = params.get('room_id')
      if (roomId) {
        setGcalPickRoomId(roomId)
        setGcalPickLoading(true)
        fetch(`${api}/gcal/calendars?room_id=${roomId}`)
          .then(r => r.json())
          .then(data => { setGcalCalendars(Array.isArray(data) ? data : []); setGcalPickLoading(false) })
          .catch(() => setGcalPickLoading(false))
      }
    } else if (gcal === 'error') setGcalToast('Google Calendar connection failed. Please try again.')
    else if (gcal === 'no_refresh_token') setGcalToast('No refresh token returned — try again with prompt=consent.')
    if (gcal) {
      const url = new URL(window.location.href)
      url.searchParams.delete('gcal')
      url.searchParams.delete('room_id')
      url.searchParams.delete('tab')
      window.history.replaceState({}, '', url)
    }
  }, [])

  useEffect(() => {
    if (!gcalToast) return
    if (gcalToastTimer.current) clearTimeout(gcalToastTimer.current)
    gcalToastTimer.current = setTimeout(() => setGcalToast(null), 4000)
  }, [gcalToast])

  async function disconnectGcal(roomId: string) {
    setDisconnectingRoomId(roomId)
    await Promise.all([
      fetch(`${api}/gcal/disconnect/${roomId}`, { method: 'DELETE' }),
      fetch(`${api}/rooms/${roomId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ google_calendar_id: null }) }),
    ])
    await fetchAllRooms()
    setDisconnectingRoomId(null)
  }

  async function pickCalendar(calendarId: string) {
    if (!gcalPickRoomId) return
    setGcalPickSaving(true)
    await fetch(`${api}/rooms/${gcalPickRoomId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_calendar_id: calendarId }),
    })
    // Register push webhook
    const watchRes = await fetch(`${api}/gcal/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: gcalPickRoomId }),
    }).catch(() => null)
    await fetchAllRooms()
    setGcalPickRoomId(null)
    setGcalCalendars([])
    setGcalPickSaving(false)
    if (!watchRes?.ok) setGcalToast('Calendar connected, but live sync could not be enabled. Check domain verification in Google Cloud Console.')
    else setGcalToast('Google Calendar connected.')
  }

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
    setBulkCancelConfirm(true)
  }

  async function confirmBulkCancel() {
    setBulkCancelConfirm(false)
    setBulkCancelling(true)
    const toCancel = bookings.filter(b => selected.has(b.id))
    await Promise.all(toCancel.map(b =>
      fetch(`/api/cancel/${b.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'this' }) })
    ))
    await fetchBookings()
    setBulkCancelling(false)
  }

  async function toggleRoom(room: any) {
    await fetch(`${api}/rooms/${room.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !room.is_active }),
    })
    fetchAllRooms()
    if (nav === 'Overview') fetch(`${api}/admin/stats?from=${from}&to=${to}`).then(r => r.json()).then(setStats)
  }

  async function saveRoom() {
    setRoomSaving(true)
    await fetch(`${api}/rooms/${editingRoom.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editDraft.name, room_type: editDraft.room_type || null, capacity: Number(editDraft.capacity), amenities: editDraft.amenities }),
    })
    setEditingRoom(null)
    setEditDraft(null)
    setRoomSaving(false)
    fetchAllRooms()
  }

  async function addRoom() {
    setRoomSaving(true)
    await fetch(`${api}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDraft.name, room_type: newDraft.room_type || null, capacity: Number(newDraft.capacity), amenities: newDraft.amenities }),
    })
    setAddingRoom(false)
    setNewDraft({ name: '', room_type: '', capacity: '4', amenities: [] })
    setRoomSaving(false)
    fetchAllRooms()
  }

  async function deleteRoomById(room: any) {
    const bookingWarning = room._hasBookings ? ' This room has upcoming bookings — they will remain but the room will be hidden.' : ''
    if (!confirm(`Delete "${room.name}"?${bookingWarning}`)) return
    setDeletingRoomId(room.id)
    const res = await fetch(`${api}/rooms/${room.id}`, { method: 'DELETE' })
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
    const res = await fetch(`${api}/members`, {
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
    const member = members.find((m: any) => m.id === id)
    if (!confirm(`Remove ${member?.name ?? 'this member'}?`)) return
    setRemovingMemberId(id)
    const isAdmin = adminList.some((a: any) => a.email.toLowerCase() === member?.email?.toLowerCase())
    await fetch(`${api}/members/${id}`, { method: 'DELETE' })
    if (isAdmin && member?.email) {
      await fetch(`${api}/admin/admins`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: member.email }) })
      const res = await fetch(`${api}/admin/admins`).then(r => r.json())
      setAdminList(res.admins ?? res)
    }
    setRemovingMemberId(null)
    fetchMembers()
  }

  async function bulkRemoveMembers() {
    const count = selectedMembers.size
    if (!confirm(`Remove ${count} member${count > 1 ? 's' : ''}?`)) return
    setBulkRemovingMembers(true)
    await Promise.all([...selectedMembers].map(id => fetch(`${api}/members/${id}`, { method: 'DELETE' })))
    setSelectedMembers(new Set())
    setBulkRemovingMembers(false)
    fetchMembers()
  }

  function sortedMembers() {
    const q = memberSearch.toLowerCase()
    return [...members]
      .filter(m => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .sort((a, b) => {
        let av: string, bv: string
        if (memberSortCol === 'name')       { av = a.name;      bv = b.name }
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

  async function saveMemberEdit() {
    setMemberEditSaving(true)
    setMemberEditError('')
    const res = await fetch(`${api}/members/${editingMemberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editMemberDraft.name.trim(), email: editMemberDraft.email.trim().toLowerCase() }),
    })
    const data = await res.json()
    if (!res.ok) { setMemberEditError(data.error ?? 'Failed to save.'); setMemberEditSaving(false); return }
    setEditingMemberId(null)
    setMemberEditSaving(false)
    fetchMembers()
  }

  async function batchAddMembers() {
    setBatchAdding(true)
    setBatchResult(null)
    const lines = batchText.split('\n').map(l => l.trim()).filter(Boolean)
    const rows = lines.flatMap(line => {
      const parts = line.split(/\t|,/).map(p => p.trim()).filter(Boolean)
      if (parts.length >= 2) return [{ name: parts[0], email: parts[1] }]
      if (parts.length === 1 && parts[0].includes('@')) return [{ name: parts[0].split('@')[0], email: parts[0] }]
      return []
    })
    let added = 0, skipped = 0
    const errors: string[] = []
    for (const row of rows) {
      const res = await fetch(`${api}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      })
      if (res.ok) { added++ }
      else {
        const d = await res.json()
        if (res.status === 409) skipped++
        else errors.push(`${row.email}: ${d.error ?? 'error'}`)
      }
    }
    setBatchResult({ added, skipped, errors })
    setBatchAdding(false)
    if (added > 0) { setBatchText(''); fetchMembers() }
  }

  async function addType() {
    const t = newTypeText.trim()
    if (!t) return
    setTypeAdding(true)
    setTypeError('')
    const res = await fetch(`${api}/room-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: t }),
    })
    const data = await res.json()
    if (!res.ok) { setTypeError(data.error ?? 'Failed to add.'); setTypeAdding(false); return }
    setNewTypeText('')
    setTypeAdding(false)
    fetch(`${api}/room-types`).then(r => r.json()).then(setRoomTypes)
  }

  async function deleteType(type: string) {
    setDeletingType(type)
    await fetch(`${api}/room-types/${encodeURIComponent(type)}`, { method: 'DELETE' })
    setDeletingType(null)
    fetch(`${api}/room-types`).then(r => r.json()).then(setRoomTypes)
  }

  async function addAmenity() {
    const a = newAmenityText.trim()
    if (!a) return
    setAmenityAdding(true)
    setAmenityError('')
    const res = await fetch(`${api}/amenities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amenity: a }),
    })
    const data = await res.json()
    if (!res.ok) { setAmenityError(data.error ?? 'Failed to add.'); setAmenityAdding(false); return }
    setNewAmenityText('')
    setAmenityAdding(false)
    fetch(`${api}/amenities`).then(r => r.json()).then(setAmenityOptions)
  }

  async function deleteAmenity(amenity: string) {
    setDeletingAmenity(amenity)
    await fetch(`${api}/amenities/${encodeURIComponent(amenity)}`, { method: 'DELETE' })
    setDeletingAmenity(null)
    fetch(`${api}/amenities`).then(r => r.json()).then(setAmenityOptions)
  }

  async function logout() {
    await fetch(`${api}/admin/logout`, { method: 'POST' })
    window.location.href = '/admin'
  }

  if (!stats) return (
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
    </div>
  )

  const { totals, roomStats, hourStats, concurrentStats, dowHourStats, busiestDate } = stats
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
        {/* Left: logo + view app */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: NAVY, fontFamily: "'Spectral', Georgia, serif", letterSpacing: '0.02em' }}>
            space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>{' '}
            <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400, fontStyle: 'normal', fontFamily: 'inherit' }}>admin</span>
          </div>
          <a href={`/${workspace}`} style={{ fontSize: 12, color: '#fff', textDecoration: 'none', padding: '6px 14px', background: NAVY, whiteSpace: 'nowrap', fontWeight: 500 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            View app →
          </a>
        </div>
        {/* Right: date range + export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        </div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>Showing data for</span>
                <span style={{ fontSize: 12, color: NAVY, background: NAVY_LIGHT, padding: '3px 10px', borderRadius: 0, fontWeight: 500 }}>
                  {customFrom ? `${customFrom} – ${customTo}` : PRESETS.find(p => p.key === preset)?.label}
                </span>
              </div>
              {roomTypes.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Type</span>
                  <button onClick={() => { setFilterRoomType(''); setFilterRoom('') }}
                    style={{ fontSize: 12, padding: '3px 10px', borderRadius: 0, border: `1px solid ${!filterRoomType ? NAVY : '#cccccc'}`, background: !filterRoomType ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: !filterRoomType ? NAVY : '#6B7280' }}>
                    All types
                  </button>
                  {roomTypes.map(t => (
                    <button key={t} onClick={() => { setFilterRoomType(t); setFilterRoom('') }}
                      style={{ fontSize: 12, padding: '3px 10px', borderRadius: 0, border: `1px solid ${filterRoomType === t ? NAVY : '#cccccc'}`, background: filterRoomType === t ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: filterRoomType === t ? NAVY : '#6B7280' }}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>Room</span>
                <button onClick={() => setFilterRoom('')}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 0, border: `1px solid ${!filterRoom ? NAVY : '#cccccc'}`, background: !filterRoom ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: !filterRoom ? NAVY : '#6B7280' }}>
                  All rooms
                </button>
                {(filterRoomType ? overviewRooms.filter((r: any) => r.room_type === filterRoomType) : overviewRooms).map((r: any) => (
                  <button key={r.id} onClick={() => setFilterRoom(r.id)}
                    style={{ fontSize: 12, padding: '3px 10px', borderRadius: 0, border: `1px solid ${filterRoom === r.id ? NAVY : '#cccccc'}`, background: filterRoom === r.id ? NAVY_LIGHT : '#fff', cursor: 'pointer', color: filterRoom === r.id ? NAVY : '#6B7280' }}>
                    {r.name}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: totals.outside_display_hours > 0 ? 8 : 14, maxWidth: 480 }}>
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
              {totals.outside_display_hours > 0 && (
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 14 }}>
                  + {totals.outside_display_hours} booking{totals.outside_display_hours !== 1 ? 's' : ''} outside display hours ({Math.round(totals.outside_display_hours / totals.total_bookings * 100)}% of total)
                </div>
              )}

              {stats.originStats && totals.total_bookings > 0 && (() => {
                const os = stats.originStats
                const bars: { key: string; label: string; color: string; count: number; pct: number }[] = [
                  { key: 'desktop', label: 'Desktop',        color: SAGE,      count: os.desktop.count, pct: os.desktop.pct },
                  { key: 'tablet',  label: 'Tablet',         color: '#c45f80', count: os.tablet.count,  pct: os.tablet.pct  },
                  { key: 'gcal',    label: 'Google Calendar', color: '#4285F4', count: os.gcal.count,    pct: os.gcal.pct    },
                ].filter(b => b.count > 0)
                return (
                  <div style={{ background: '#fff', border: '1px solid #dddddd', padding: 13, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 10 }}>Booking origin</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {bars.map(b => (
                        <div key={b.key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 3 }}>
                            <span>{b.label}</span>
                            <span style={{ fontWeight: 500, color: '#374151' }}>{b.pct}% <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({b.count})</span></span>
                          </div>
                          <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3 }}>
                            <div style={{ height: 6, borderRadius: 3, background: b.color, width: `${b.pct}%`, transition: 'width .4s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {!filterRoom && concurrentStats && concurrentStats.total_rooms >= 2 && (() => {
                const cs = concurrentStats
                const maxSlots = Math.max(...cs.distribution.map((d: any) => d.slots), 1)
                return (
                  <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 13, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Space pressure</div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          Peak: <span style={{ color: '#374151', fontWeight: 500 }}>{cs.peak_concurrent} / {cs.total_rooms} rooms</span>
                        </span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          At capacity: <span style={{ color: cs.full_pct >= 10 ? BUSY : '#374151', fontWeight: 500 }}>{cs.full_pct}%</span> of hours
                        </span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          High demand: <span style={{ color: cs.high_demand_pct >= 20 ? '#D97706' : '#374151', fontWeight: 500 }}>{cs.high_demand_pct}%</span>
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }}>
                      {cs.distribution.map((d: any) => {
                        const barH = Math.max(2, Math.round(d.slots / maxSlots * 60))
                        const pct = cs.total_slots > 0 ? Math.round(d.slots / cs.total_slots * 100) : 0
                        const fraction = cs.total_rooms > 0 ? d.rooms_in_use / cs.total_rooms : 0
                        const color = fraction >= 1 ? BUSY : fraction >= 0.8 ? '#D97706' : fraction >= 0.5 ? '#7A9A4A' : SAGE
                        return (
                          <div key={d.rooms_in_use} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                            <div title={`${d.rooms_in_use} room${d.rooms_in_use !== 1 ? 's' : ''} occupied: ${pct}% of business hours`}
                              style={{ borderRadius: '2px 2px 0 0', width: '100%', height: barH, background: color, opacity: d.slots === 0 ? 0.15 : 0.82 }} />
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{d.rooms_in_use}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: '#C0C8D0', marginTop: 2 }}>rooms occupied simultaneously · sampled every 30 min</div>
                  </div>
                )
              })()}

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

              {dowHourStats && dowHourStats.length > 0 && (() => {
                const dhs: { dow: number; hour: number; count: number }[] = dowHourStats
                const hours = [...new Set(dhs.map((d: any) => d.hour))].sort((a: number, b: number) => a - b)
                const maxCount = Math.max(...dhs.map((d: any) => d.count), 1)
                const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                const fmtH = (h: number) => h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`
                const busiestDow = stats.dowStats ? [...stats.dowStats].sort((a: any, b: any) => b.total_bookings - a.total_bookings)[0] : null
                return (
                  <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 13, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Bookings by day & hour</div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        {busiestDate && (
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                            Busiest day: <span style={{ color: NAVY, fontWeight: 500 }}>
                              {new Date(busiestDate.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                            {' · '}{busiestDate.total_bookings} bookings
                          </span>
                        )}
                        {busiestDow && busiestDow.total_bookings > 0 && (
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                            Busiest day of week: <span style={{ color: NAVY, fontWeight: 500 }}>{busiestDow.label}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', marginRight: 5, marginTop: 22 }}>
                        {hours.map((h: number) => (
                          <div key={h} style={{ height: 14, marginBottom: 2, display: 'flex', alignItems: 'center', fontSize: 9, color: '#C0C8D0', width: 22, justifyContent: 'flex-end' }}>
                            {fmtH(h)}
                          </div>
                        ))}
                      </div>
                      {DOW.map((day, dow) => {
                        const dowTotal = stats.dowStats?.find((d: any) => d.dow === dow)?.total_bookings ?? 0
                        const isBusiestDow = busiestDow?.dow === dow && dowTotal > 0
                        return (
                          <div key={dow} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: isBusiestDow ? NAVY : '#9CA3AF', fontWeight: isBusiestDow ? 600 : 400 }}>
                              {day}
                            </div>
                            {hours.map((h: number) => {
                              const cell = dhs.find((d: any) => d.dow === dow && d.hour === h)
                              const count = cell?.count ?? 0
                              const opacity = count === 0 ? 0.04 : 0.15 + 0.85 * (count / maxCount)
                              return (
                                <div key={h}
                                  title={`${day} ${fmtH(h)}: ${count} booking${count !== 1 ? 's' : ''}`}
                                  style={{ height: 14, borderRadius: 2, background: SAGE, opacity, margin: '0 1px 2px' }}
                                />
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
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
              <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Room types</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {roomTypes.map(t => (
                    <div key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0f0f0', padding: '3px 8px', fontSize: 12, color: '#374151' }}>
                      {t}
                      <button onClick={() => deleteType(t)} disabled={deletingType === t}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 13, padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>
                        ×
                      </button>
                    </div>
                  ))}
                  {roomTypes.length === 0 && <span style={{ fontSize: 12, color: '#9CA3AF' }}>No types yet</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newTypeText} onChange={e => { setNewTypeText(e.target.value); setTypeError('') }}
                    placeholder="New type…"
                    style={{ ...inp, flex: 1 }}
                    onKeyDown={e => { if (e.key === 'Enter') addType() }}
                  />
                  <button onClick={addType} disabled={typeAdding || !newTypeText.trim()}
                    style={{ fontSize: 12, padding: '5px 14px', border: 'none', background: SAGE, color: '#fff', cursor: 'pointer', borderRadius: 0, opacity: typeAdding ? 0.7 : 1 }}>
                    {typeAdding ? '…' : 'Add'}
                  </button>
                </div>
                {typeError && <div style={{ fontSize: 12, color: BUSY, marginTop: 6 }}>{typeError}</div>}
              </div>

              <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Amenities</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {amenityOptions.map(a => (
                    <div key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0f0f0', padding: '3px 8px', fontSize: 12, color: '#374151' }}>
                      {a}
                      <button onClick={() => deleteAmenity(a)} disabled={deletingAmenity === a}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 13, padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>
                        ×
                      </button>
                    </div>
                  ))}
                  {amenityOptions.length === 0 && <span style={{ fontSize: 12, color: '#9CA3AF' }}>No amenities yet</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newAmenityText} onChange={e => { setNewAmenityText(e.target.value); setAmenityError('') }}
                    placeholder="New amenity…"
                    style={{ ...inp, flex: 1 }}
                    onKeyDown={e => { if (e.key === 'Enter') addAmenity() }}
                  />
                  <button onClick={addAmenity} disabled={amenityAdding || !newAmenityText.trim()}
                    style={{ fontSize: 12, padding: '5px 14px', border: 'none', background: SAGE, color: '#fff', cursor: 'pointer', borderRadius: 0, opacity: amenityAdding ? 0.7 : 1 }}>
                    {amenityAdding ? '…' : 'Add'}
                  </button>
                </div>
                {amenityError && <div style={{ fontSize: 12, color: BUSY, marginTop: 6 }}>{amenityError}</div>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Rooms</span>
                <button onClick={() => setAddingRoom(true)}
                  style={{ fontSize: 12, padding: '6px 12px', borderRadius: 0, border: 'none', background: SAGE, color: '#fff', cursor: 'pointer' }}>
                  + Add room
                </button>
              </div>
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleRoomDragEnd}>
                <SortableContext items={allRooms.map((r: any) => r.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allRooms.map((r: any) => (
                  <SortableRoomItem key={r.id} id={r.id}>{(dragHandleProps) => (
                  <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div {...dragHandleProps} style={{ cursor: 'grab', color: '#D1D5DB', flexShrink: 0, display: 'flex', alignItems: 'center', touchAction: 'none' }}>
                      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="9" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="9" cy="13" r="1.5"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: r.is_active ? '#374151' : '#9CA3AF' }}>{r.name}</span>
                        {!r.is_active && <span style={{ fontSize: 11, color: '#9CA3AF', background: '#f0f0f0', padding: '1px 6px', borderRadius: 0 }}>inactive</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                        {r.room_type && <>{r.room_type} · </>}{r.capacity} people · {r.amenities.length > 0 ? r.amenities.join(', ') : 'No amenities listed'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.gcal_connected && r.google_calendar_id ? (
                        <button onClick={() => disconnectGcal(r.id)} disabled={disconnectingRoomId === r.id}
                          title={`Calendar linked: ${r.google_calendar_id}\nClick to disconnect`}
                          style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: '1px solid #C8E6C9', background: '#F1F8F2', cursor: 'pointer', color: FREE, whiteSpace: 'nowrap' }}>
                          {disconnectingRoomId === r.id ? '…' : '✓ GCal'}
                        </button>
                      ) : r.gcal_connected && !r.google_calendar_id ? (
                        <button onClick={() => {
                          setGcalPickRoomId(r.id)
                          setGcalPickLoading(true)
                          fetch(`${api}/gcal/calendars?room_id=${r.id}`)
                            .then(res => res.json())
                            .then(data => { setGcalCalendars(Array.isArray(data) ? data : []); setGcalPickLoading(false) })
                            .catch(() => setGcalPickLoading(false))
                        }}
                          style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: '1px solid #FDE68A', background: '#FFFBEB', cursor: 'pointer', color: '#92400E', whiteSpace: 'nowrap' }}>
                          Pick calendar
                        </button>
                      ) : (
                        <a href={`/api/${workspace}/gcal/auth?room_id=${r.id}`}
                          style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: '1px solid #cccccc', background: 'none', cursor: 'pointer', color: '#6B7280', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          + GCal
                        </a>
                      )}
                      <div onClick={() => toggleRoom(r)} title={r.is_active ? 'Deactivate room' : 'Activate room'}
                        style={{ width: 30, height: 17, borderRadius: 9, background: r.is_active ? SAGE : '#C8CDD4', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', width: 11, height: 11, borderRadius: '50%', background: '#fff', top: 3, left: r.is_active ? 16 : 3, transition: 'left .2s' }} />
                      </div>
                      {r.tablet_token && (
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/api/${workspace}/t/${r.tablet_token}`
                            navigator.clipboard.writeText(url).then(() => {
                              setCopiedTabletRoomId(r.id)
                              setTimeout(() => setCopiedTabletRoomId(null), 2000)
                            })
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 0, border: `1px solid ${copiedTabletRoomId === r.id ? '#C8E6C9' : '#cccccc'}`, background: copiedTabletRoomId === r.id ? '#F1F8F2' : 'none', cursor: 'pointer', color: copiedTabletRoomId === r.id ? FREE : '#6B7280', fontSize: 11, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                          {copiedTabletRoomId === r.id
                            ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                            : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Tablet URL</>
                          }
                        </button>
                      )}
                      <button onClick={() => { setEditingRoom(r); setEditDraft({ name: r.name, room_type: r.room_type ?? '', capacity: r.capacity, amenities: [...r.amenities] }) }}
                        style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: '1px solid #cccccc', background: 'none', cursor: 'pointer', color: '#6B7280' }}>
                        Edit
                      </button>
                      <button onClick={() => deleteRoomById(r)} disabled={deletingRoomId === r.id}
                        style={{ fontSize: 11, padding: '4px 9px', borderRadius: 0, border: '1px solid #F0CACA', background: 'none', cursor: 'pointer', color: BUSY }}>
                        {deletingRoomId === r.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                  )}</SortableRoomItem>
                ))}
              </div>
                </SortableContext>
              </DndContext>

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
                      <label style={lbl}>Room type</label>
                      <select style={{ ...inp, width: '100%' }} value={editDraft.room_type} onChange={e => setEditDraft((d: any) => ({ ...d, room_type: e.target.value }))}>
                        <option value="">None</option>
                        {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Capacity</label>
                      <input style={{ ...inp, width: '80px' }} type="number" min={1} value={editDraft.capacity} onChange={e => setEditDraft((d: any) => ({ ...d, capacity: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={lbl}>Amenities</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {amenityOptions.map(a => {
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
                      <input autoFocus style={{ ...inp, width: '100%' }} placeholder="e.g. Lovelace" value={newDraft.name} onChange={e => setNewDraft(d => ({ ...d, name: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Room type</label>
                      <select style={{ ...inp, width: '100%' }} value={newDraft.room_type} onChange={e => setNewDraft(d => ({ ...d, room_type: e.target.value }))}>
                        <option value="">None</option>
                        {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Capacity</label>
                      <input style={{ ...inp, width: '80px' }} type="number" min={1} value={newDraft.capacity} onChange={e => setNewDraft(d => ({ ...d, capacity: e.target.value }))} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={lbl}>Amenities</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {amenityOptions.map(a => {
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
                      <button onClick={() => { setAddingRoom(false); setNewDraft({ name: '', room_type: '', capacity: '4', amenities: [] }) }}
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
                <input
                  value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search…"
                  style={{ ...inp, width: 160, fontSize: 12, padding: '4px 8px' }}
                />
                {selectedMembers.size > 0 && (
                  <button onClick={bulkRemoveMembers} disabled={bulkRemovingMembers}
                    style={{ fontSize: 12, padding: '4px 12px', borderRadius: 0, border: '1px solid #F0CACA', background: '#FEF2F2', color: BUSY, cursor: 'pointer' }}>
                    {bulkRemovingMembers ? 'Removing…' : `Remove ${selectedMembers.size} selected`}
                  </button>
                )}
                <button onClick={() => { setBatchAddOpen(o => !o); setBatchResult(null) }}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 0, border: '1px solid #dddddd', background: batchAddOpen ? '#f5f5f5' : '#fff', color: '#374151', cursor: 'pointer', marginLeft: 'auto' }}>
                  Batch add
                </button>
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

              {/* Batch add panel */}
              {batchAddOpen && (
                <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: '14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Batch add members</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>
                    Paste from a spreadsheet — one member per line, name and email separated by a tab or comma.
                  </div>
                  <textarea
                    value={batchText} onChange={e => setBatchText(e.target.value)}
                    placeholder={'Alice Smith\talice@example.com\nBob Jones\tbob@example.com'}
                    style={{ width: '100%', height: 120, padding: '8px 10px', border: '1px solid #dddddd', borderRadius: 0, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', outline: 'none', color: '#374151' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <button onClick={batchAddMembers} disabled={batchAdding || !batchText.trim()}
                      style={{ fontSize: 12, padding: '6px 14px', borderRadius: 0, border: 'none', background: SAGE, color: '#fff', cursor: 'pointer', opacity: batchAdding ? 0.7 : 1 }}>
                      {batchAdding ? 'Importing…' : 'Import'}
                    </button>
                    {batchResult && (
                      <span style={{ fontSize: 12, color: batchResult.errors.length ? BUSY : SAGE }}>
                        {batchResult.added > 0 && `${batchResult.added} added`}
                        {batchResult.skipped > 0 && ` · ${batchResult.skipped} skipped (duplicate)`}
                        {batchResult.errors.map(e => ` · ${e}`)}
                      </span>
                    )}
                  </div>
                </div>
              )}

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
                        {([['Name', 'name'], ['Email', 'email'], ['Role', null], ['Joined', 'joined'], ['Last active', 'last_used'], ['', null]] as [string, string | null][]).map(([label, col]) => (
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
                        const isEditing = editingMemberId === m.id
                        return (
                          <tr key={m.id} style={{ background: isEditing ? '#FFFBF0' : isSelected ? '#F0F4FF' : 'transparent' }}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                              <input type="checkbox" checked={isSelected} disabled={isEditing}
                                onChange={e => setSelectedMembers(prev => { const s = new Set(prev); e.target.checked ? s.add(m.id) : s.delete(m.id); return s })} />
                            </td>
                            <td style={{ padding: '6px 12px', borderBottom: '1px solid #eeeeee', color: '#374151', fontWeight: 500 }}>
                              {isEditing
                                ? <input value={editMemberDraft.name} onChange={e => setEditMemberDraft(d => ({ ...d, name: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') saveMemberEdit(); if (e.key === 'Escape') setEditingMemberId(null) }}
                                    style={{ ...inp, width: '100%', fontSize: 12, padding: '3px 6px' }} autoFocus />
                                : m.name}
                            </td>
                            <td style={{ padding: '6px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF' }}>
                              {isEditing
                                ? <input type="email" value={editMemberDraft.email} onChange={e => setEditMemberDraft(d => ({ ...d, email: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') saveMemberEdit(); if (e.key === 'Escape') setEditingMemberId(null) }}
                                    style={{ ...inp, width: '100%', fontSize: 12, padding: '3px 6px' }} />
                                : m.email}
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', whiteSpace: 'nowrap' }}>
                              {(() => {
                                const adminEntry = adminList.find(a => a.email.toLowerCase() === m.email.toLowerCase())
                                const role = adminEntry?.role
                                if (!role) return <span style={{ fontSize: 11, color: '#9CA3AF' }}>User</span>
                                return (
                                  <span style={{ fontSize: 11, color: role === 'super_admin' ? '#7C3AED' : SAGE, background: role === 'super_admin' ? '#F5F3FF' : SAGE_LIGHT, padding: '2px 7px', borderRadius: 0 }}>
                                    {role === 'super_admin' ? 'Super admin' : 'Admin'}
                                  </span>
                                )
                              })()}
                              {myRole === 'super_admin' && (() => {
                                const adminEntry = adminList.find(a => a.email.toLowerCase() === m.email.toLowerCase())
                                const role = adminEntry?.role
                                return (
                                  <select
                                    value={role ?? ''}
                                    onChange={async e => {
                                      const newRole = e.target.value
                                      if (!newRole) {
                                        await fetch(`${api}/admin/admins`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: m.email }) })
                                      } else {
                                        await fetch(`${api}/admin/admins`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: m.email, role: newRole }) })
                                      }
                                      const res = await fetch(`${api}/admin/admins`).then(r => r.json())
                                      setAdminList(res.admins ?? res)
                                    }}
                                    style={{ marginLeft: 6, fontSize: 11, border: '1px solid #dddddd', background: '#fff', padding: '2px 4px', cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}
                                  >
                                    <option value="">User</option>
                                    <option value="admin">Admin</option>
                                    <option value="super_admin">Super admin</option>
                                  </select>
                                )
                              })()}
                            </td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{fmtJoined(m.added_at)}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', whiteSpace: 'nowrap' }}>{(() => { const { label, color } = fmtActivity(m.last_used ?? null); return <span style={{ color, fontSize: 12, fontWeight: label === '—' ? 400 : 500 }}>{label}</span> })()}</td>
                            <td style={{ padding: '6px 12px', borderBottom: '1px solid #eeeeee', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <button onClick={saveMemberEdit} disabled={memberEditSaving || !editMemberDraft.name.trim() || !editMemberDraft.email.trim()}
                                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 0, border: 'none', background: SAGE, color: '#fff', cursor: 'pointer', opacity: memberEditSaving ? 0.7 : 1 }}>
                                    {memberEditSaving ? '…' : 'Save'}
                                  </button>
                                  <button onClick={() => { setEditingMemberId(null); setMemberEditError('') }}
                                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 0, border: '1px solid #dddddd', background: 'none', cursor: 'pointer', color: '#6B7280' }}>
                                    Cancel
                                  </button>
                                  {memberEditError && <span style={{ fontSize: 11, color: BUSY }}>{memberEditError}</span>}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={() => { setEditingMemberId(m.id); setEditMemberDraft({ name: m.name, email: m.email }); setMemberEditError('') }}
                                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 0, border: '1px solid #dddddd', background: 'none', cursor: 'pointer', color: '#374151' }}>
                                    Edit
                                  </button>
                                  <button onClick={() => removeMemberById(m.id)} disabled={removingMemberId === m.id}
                                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 0, border: '1px solid #F0CACA', background: 'none', cursor: 'pointer', color: BUSY }}>
                                    {removingMemberId === m.id ? '…' : 'Remove'}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {/* Redis-only admins — have panel access but no member row */}
                      {adminList.filter((a: any) => !members.some((m: any) => m.email.toLowerCase() === a.email.toLowerCase())).map((a: any) => (
                        <tr key={a.email} style={{ background: '#FFFBF0' }}>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }} />
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF', fontStyle: 'italic' }}>—</td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF' }}>{a.email}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, color: a.role === 'super_admin' ? '#7C3AED' : SAGE, background: a.role === 'super_admin' ? '#F5F3FF' : SAGE_LIGHT, padding: '2px 7px', borderRadius: 0 }}>
                              {a.role === 'super_admin' ? 'Super admin' : 'Admin'}
                            </span>
                            {myRole === 'super_admin' && (
                              <select
                                value={a.role}
                                onChange={async e => {
                                  const newRole = e.target.value
                                  if (!newRole) {
                                    await fetch(`${api}/admin/admins`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email }) })
                                  } else {
                                    await fetch(`${api}/admin/admins`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email, role: newRole }) })
                                  }
                                  const res = await fetch(`${api}/admin/admins`).then(r => r.json())
                                  setAdminList(res.admins ?? res)
                                }}
                                style={{ marginLeft: 6, fontSize: 11, border: '1px solid #dddddd', background: '#fff', padding: '2px 4px', cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}
                              >
                                <option value="">User</option>
                                <option value="admin">Admin</option>
                                <option value="super_admin">Super admin</option>
                              </select>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF' }}>—</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', color: '#9CA3AF' }}>—</td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid #eeeeee' }}>
                            {myRole === 'super_admin' && (
                              <button onClick={async () => {
                                await fetch(`${api}/admin/admins`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email }) })
                                const res = await fetch(`${api}/admin/admins`).then(r => r.json())
                                setAdminList(res.admins ?? res)
                              }} style={{ fontSize: 11, padding: '3px 7px', borderRadius: 0, border: '1px solid #F0CACA', background: 'none', cursor: 'pointer', color: BUSY }}>
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
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
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Workspace name</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={wsName}
                    onChange={e => { setWsName(e.target.value); setWsNameSaved(false) }}
                    placeholder={workspace}
                    style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #dddddd', borderRadius: 0, outline: 'none', fontFamily: 'inherit', flex: 1 }}
                  />
                  <button
                    disabled={wsNameSaving}
                    onClick={async () => {
                      setWsNameSaving(true)
                      await fetch(`${api}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceName: wsName.trim() }) })
                      setWsNameSaving(false)
                      setWsNameSaved(true)
                    }}
                    style={{ fontSize: 12, padding: '6px 14px', borderRadius: 0, border: '1px solid #dddddd', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {wsNameSaving ? 'Saving…' : wsNameSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>

              <EntryLinkCard workspace={workspace} adminEntryToken={adminEntryToken} />

              <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 16, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Admin password</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>Set via the <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 4 }}>ADMIN_PASSWORD</code> environment variable.</div>
                <button onClick={logout}
                  style={{ fontSize: 12, padding: '7px 14px', borderRadius: 0, border: '1px solid #F0CACA', background: 'none', cursor: 'pointer', color: BUSY }}>
                  Sign out
                </button>
              </div>

              <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 16, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>User directory</div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                  Name/email autocomplete is populated from <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 4 }}>public/users.json</code>.
                  Replace this file with your Slack export (array of <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 4 }}>{`{name, email}`}</code> objects).
                </div>
              </div>

              {(() => {
                const fmtH = (h: number) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`
                const selStyle = { fontSize: 12, padding: '6px 8px', border: '1px solid #dddddd', borderRadius: 0, outline: 'none', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }
                return (<>
                  <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 16, marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Display hours</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>The time range shown in the calendar grid. Drives utilization and heatmap stats.</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>From</div>
                        <select value={dispStart} onChange={e => setDispStart(Number(e.target.value))} style={selStyle}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h} disabled={h >= dispEnd - 1}>{fmtH(h)}</option>)}
                        </select>
                      </div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', paddingTop: 18 }}>to</div>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>To</div>
                        <select value={dispEnd} onChange={e => setDispEnd(Number(e.target.value))} style={selStyle}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h} disabled={h <= dispStart + 1}>{fmtH(h)}</option>)}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setDispSaving(true)
                        await fetch(`${api}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayHours: { start: dispStart, end: dispEnd } }) })
                        setDispSaving(false); setDispSaved(true); setTimeout(() => setDispSaved(false), 2000)
                      }}
                      disabled={dispSaving}
                      style={{ fontSize: 12, padding: '7px 14px', borderRadius: 0, border: `1px solid ${dispSaved ? '#a3d9a5' : SAGE}`, background: dispSaved ? '#eef7f0' : 'none', cursor: dispSaving ? 'default' : 'pointer', color: dispSaved ? FREE : SAGE }}>
                      {dispSaved ? 'Saved' : dispSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Booking hours</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>The full range for data collection — early and late bookings outside display hours are counted separately in stats.</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>From</div>
                        <select value={bhStart} onChange={e => setBhStart(Number(e.target.value))} style={selStyle}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h} disabled={h >= bhEnd - 1}>{fmtH(h)}</option>)}
                        </select>
                      </div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', paddingTop: 18 }}>to</div>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>To</div>
                        <select value={bhEnd} onChange={e => setBhEnd(Number(e.target.value))} style={selStyle}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h} disabled={h <= bhStart + 1}>{fmtH(h)}</option>)}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setBhSaving(true)
                        await fetch(`${api}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingHours: { start: bhStart, end: bhEnd } }) })
                        setBhSaving(false); setBhSaved(true); setTimeout(() => setBhSaved(false), 2000)
                      }}
                      disabled={bhSaving}
                      style={{ fontSize: 12, padding: '7px 14px', borderRadius: 0, border: `1px solid ${bhSaved ? '#a3d9a5' : SAGE}`, background: bhSaved ? '#eef7f0' : 'none', cursor: bhSaving ? 'default' : 'pointer', color: bhSaved ? FREE : SAGE }}>
                      {bhSaved ? 'Saved' : bhSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </>)
              })()}

              <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 16, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Booking visibility</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 14 }}>
                  What other users can see on bookings that aren't theirs. Your own bookings always show full detail.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                  {([
                    [visShowTitle,     setVisShowTitle,     'Show meeting title'],
                    [visShowOrganizer, setVisShowOrganizer, 'Show organizer name'],
                  ] as [boolean, (v: boolean) => void, string][]).map(([val, set, label]) => (
                    <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <div onClick={() => set(!val)}
                        style={{ width: 30, height: 17, borderRadius: 9, background: val ? SAGE : '#C8CDD4', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', width: 11, height: 11, borderRadius: '50%', background: '#fff', top: 3, left: val ? 16 : 3, transition: 'left .2s' }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#374151' }}>{label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 12 }}>
                  {!visShowTitle && !visShowOrganizer && 'Others see: occupied blocks only'}
                  {!visShowTitle && visShowOrganizer && 'Others see: occupied blocks · name revealed on click'}
                  {visShowTitle && !visShowOrganizer && 'Others see: meeting title on block'}
                  {visShowTitle && visShowOrganizer && 'Others see: meeting title on block · name revealed on click'}
                </div>
                <button
                  onClick={async () => {
                    setVisSaving(true)
                    await fetch(`${api}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingVisibility: { showTitle: visShowTitle, showOrganizer: visShowOrganizer } }) })
                    setVisSaving(false); setVisSaved(true); setTimeout(() => setVisSaved(false), 2000)
                  }}
                  disabled={visSaving}
                  style={{ fontSize: 12, padding: '7px 14px', borderRadius: 0, border: `1px solid ${visSaved ? '#a3d9a5' : SAGE}`, background: visSaved ? '#eef7f0' : 'none', cursor: visSaving ? 'default' : 'pointer', color: visSaved ? FREE : SAGE }}>
                  {visSaved ? 'Saved' : visSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {myRole === 'super_admin' && (
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #dddddd' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: BUSY, marginBottom: 4 }}>Danger zone</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
                    Request deletion of this workspace. You'll receive a confirmation email — nothing is deleted until the spacebook team reviews and actions the request.
                  </div>
                  {deleteReqSent ? (
                    <div style={{ fontSize: 12, color: FREE, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      Check your email to confirm the deletion request.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: 'column' }}>
                      <input
                        type="email"
                        value={deleteReqEmail}
                        onChange={e => { setDeleteReqEmail(e.target.value); setDeleteReqError('') }}
                        placeholder="Your super admin email"
                        style={{ fontSize: 12, padding: '6px 8px', border: `1px solid ${deleteReqError ? BUSY : '#dddddd'}`, borderRadius: 0, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                      />
                      {deleteReqError && <div style={{ fontSize: 11, color: BUSY }}>{deleteReqError}</div>}
                      <button
                        disabled={deleteReqSending || !deleteReqEmail.trim()}
                        onClick={async () => {
                          setDeleteReqSending(true)
                          setDeleteReqError('')
                          const res = await fetch(`${api}/delete-request`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ requesterEmail: deleteReqEmail.trim() }),
                          })
                          setDeleteReqSending(false)
                          if (res.ok) {
                            setDeleteReqSent(true)
                          } else {
                            const err = await res.json().catch(() => ({}))
                            setDeleteReqError(err.error ?? 'Something went wrong.')
                          }
                        }}
                        style={{ fontSize: 12, padding: '7px 14px', borderRadius: 0, border: `1px solid ${BUSY}`, background: 'none', cursor: deleteReqSending || !deleteReqEmail.trim() ? 'default' : 'pointer', color: BUSY, opacity: deleteReqSending || !deleteReqEmail.trim() ? 0.5 : 1 }}>
                        {deleteReqSending ? 'Sending…' : 'Request deletion'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {gcalPickRoomId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 0, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: NAVY, marginBottom: 6 }}>Choose a Google Calendar</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
              Select which calendar bookings for <strong>{allRooms.find(r => r.id === gcalPickRoomId)?.name ?? 'this room'}</strong> should sync to.
            </div>
            {gcalPickLoading ? (
              <div style={{ fontSize: 13, color: '#9CA3AF', padding: '16px 0' }}>Loading calendars…</div>
            ) : gcalCalendars.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9CA3AF', padding: '16px 0' }}>No writable calendars found.</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {gcalCalendars.map(cal => (
                  <button key={cal.id} onClick={() => pickCalendar(cal.id!)} disabled={gcalPickSaving}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 0, background: 'none', cursor: gcalPickSaving ? 'default' : 'pointer', textAlign: 'left', width: '100%' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: cal.backgroundColor ?? SAGE, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: NAVY }}>{cal.summary}</div>
                      {cal.primary && <div style={{ fontSize: 11, color: '#9CA3AF' }}>Primary calendar</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={async () => { await disconnectGcal(gcalPickRoomId!); setGcalPickRoomId(null); setGcalCalendars([]) }}
                style={{ fontSize: 12, padding: '7px 0', border: 'none', background: 'none', cursor: 'pointer', color: BUSY }}>
                Disconnect
              </button>
              <button onClick={() => { setGcalPickRoomId(null); setGcalCalendars([]) }}
                style={{ fontSize: 12, padding: '7px 0', border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkCancelConfirm && (
        <div onClick={() => setBulkCancelConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #dddddd', padding: '28px 24px', width: 320, borderRadius: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 8 }}>
              Cancel {selected.size} booking{selected.size > 1 ? 's' : ''}?
            </div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 24, lineHeight: 1.5 }}>
              For recurring bookings, only these specific occurrences will be cancelled.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setBulkCancelConfirm(false)}
                style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 500, background: 'none', border: '1px solid #dddddd', color: NAVY, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0 }}>
                Keep them
              </button>
              <button onClick={confirmBulkCancel}
                style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, background: BUSY, border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0 }}>
                Yes, cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {gcalToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: NAVY, color: '#fff', fontSize: 13, padding: '10px 18px', borderRadius: 0, zIndex: 200, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {gcalToast}
        </div>
      )}
    </div>
  )
}

function EntryLinkCard({ workspace, adminEntryToken }: { workspace: string; adminEntryToken: string | null }) {
  const [copiedTeam, setCopiedTeam] = useState(false)
  const [copiedAdmin, setCopiedAdmin] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const teamLink = `${origin}/enter/${workspace}`
  const adminLink = adminEntryToken ? `${origin}/admin-enter/${workspace}/${adminEntryToken}` : null

  function copy(link: string, setFn: (v: boolean) => void) {
    navigator.clipboard.writeText(link).then(() => { setFn(true); setTimeout(() => setFn(false), 2000) })
  }

  const linkRow = (link: string, copied: boolean, onCopy: () => void) => (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, padding: '7px 10px', background: '#f9f9f9', border: '1px solid #e5e7eb', fontSize: 11, fontFamily: 'monospace', color: '#374151', wordBreak: 'break-all' }}>
        {link}
      </div>
      <button onClick={onCopy} style={{ padding: '7px 14px', borderRadius: 0, border: '1px solid #dddddd', background: copied ? '#eef7f0' : 'none', cursor: 'pointer', fontSize: 12, color: copied ? '#4a7c59' : '#374151', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )

  return (
    <div style={{ background: '#fff', border: '1px solid #dddddd', borderRadius: 0, padding: 16, marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Invite links</div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>Team members</div>
        {linkRow(teamLink, copiedTeam, () => copy(teamLink, setCopiedTeam))}
      </div>
      {adminLink && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>Admins</div>
          {linkRow(adminLink, copiedAdmin, () => copy(adminLink, setCopiedAdmin))}
        </div>
      )}
    </div>
  )
}
