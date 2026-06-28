'use client'

import { useState, useEffect } from 'react'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtActivity(iso: string | null) {
  if (!iso) return { label: '—', color: 'rgba(255,255,255,0.2)' }
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000
  if (days <= 7)   return { label: 'Past week',    color: '#4ade80' }
  if (days <= 30)  return { label: 'Past 30 days', color: '#86efac' }
  if (days <= 90)  return { label: 'Past 90 days', color: 'rgba(255,255,255,0.5)' }
  if (days <= 365) return { label: 'Past year',    color: 'rgba(255,255,255,0.35)' }
  return { label: 'Dormant', color: 'rgba(255,255,255,0.2)' }
}

export default function PalantirPage() {
  const [tab, setTab] = useState<'workspaces' | 'tablets'>('workspaces')
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleteSlug, setDeleteSlug] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [pendingDeletes, setPendingDeletes] = useState<any[]>([])
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [limitsTarget, setLimitsTarget] = useState<any>(null)
  const [limitsDraft, setLimitsDraft] = useState({ is_trial: true, max_rooms: '10', max_members: '3', max_bookings: '50' })
  const [limitsSaving, setLimitsSaving] = useState(false)
  const [limitsError, setLimitsError] = useState('')
  const [roomsByWorkspace, setRoomsByWorkspace] = useState<Record<string, any[] | null>>({})
  const [tabletsFetched, setTabletsFetched] = useState(false)

  useEffect(() => {
    fetch('/api/palantir/workspaces')
      .then(r => r.json())
      .then(data => { setWorkspaces(data); setLoading(false) })
    fetch('/api/palantir/delete-requests')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPendingDeletes(data) })
  }, [])

  useEffect(() => {
    if (tab !== 'tablets' || tabletsFetched || workspaces.length === 0) return
    setTabletsFetched(true)
    workspaces.forEach(w => {
      setRoomsByWorkspace(prev => ({ ...prev, [w.id]: null }))
      fetch(`/api/palantir/workspaces/${w.id}/rooms`)
        .then(r => r.json())
        .then(data => setRoomsByWorkspace(prev => ({ ...prev, [w.id]: Array.isArray(data) ? data : [] })))
        .catch(() => setRoomsByWorkspace(prev => ({ ...prev, [w.id]: [] })))
    })
  }, [tab, tabletsFetched, workspaces])

  async function handleDelete() {
    if (!deleteTarget || deleteSlug !== deleteTarget.slug) {
      setDeleteError('Slug does not match.')
      return
    }
    setDeleting(true)
    const res = await fetch(`/api/palantir/workspaces/${deleteTarget.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm_slug: deleteSlug }),
    })
    if (res.ok) {
      setWorkspaces(prev => prev.filter(w => w.id !== deleteTarget.id))
      setPendingDeletes(prev => prev.filter(r => r.workspaceId !== deleteTarget.id))
      await fetch('/api/palantir/delete-requests', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: deleteTarget.id }),
      }).catch(() => {})
      setDeleteTarget(null)
      setDeleteSlug('')
    } else {
      const err = await res.json().catch(() => ({}))
      setDeleteError(err.error ?? 'Something went wrong.')
    }
    setDeleting(false)
  }

  function openLimits(w: any) {
    const l = w.limits
    setLimitsTarget(w)
    setLimitsDraft({
      is_trial: l?.is_trial ?? false,
      max_rooms: l?.max_rooms != null ? String(l.max_rooms) : '',
      max_members: l?.max_members != null ? String(l.max_members) : '',
      max_bookings: l?.max_bookings != null ? String(l.max_bookings) : '',
    })
    setLimitsError('')
  }

  async function handleSaveLimits() {
    if (!limitsTarget) return
    const parseLimit = (v: string) => v.trim() === '' ? null : parseInt(v, 10)
    const max_rooms = parseLimit(limitsDraft.max_rooms)
    const max_members = parseLimit(limitsDraft.max_members)
    const max_bookings = parseLimit(limitsDraft.max_bookings)
    if ((max_rooms !== null && (isNaN(max_rooms) || max_rooms < 1)) ||
        (max_members !== null && (isNaN(max_members) || max_members < 1)) ||
        (max_bookings !== null && (isNaN(max_bookings) || max_bookings < 1))) {
      setLimitsError('Limits must be positive integers or empty for unlimited.')
      return
    }
    setLimitsSaving(true)
    const res = await fetch(`/api/palantir/workspaces/${limitsTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_trial: limitsDraft.is_trial, max_rooms, max_members, max_bookings }),
    })
    if (res.ok) {
      setWorkspaces(prev => prev.map(w => w.id === limitsTarget.id
        ? { ...w, limits: { is_trial: limitsDraft.is_trial, max_rooms, max_members, max_bookings } }
        : w
      ))
      setLimitsTarget(null)
    } else {
      const err = await res.json().catch(() => ({}))
      setLimitsError(err.error ?? 'Something went wrong.')
    }
    setLimitsSaving(false)
  }

  async function handleDismissRequest(workspaceId: string) {
    setDismissingId(workspaceId)
    await fetch('/api/palantir/delete-requests', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
    setPendingDeletes(prev => prev.filter(r => r.workspaceId !== workspaceId))
    setDismissingId(null)
  }

  const totalRooms    = workspaces.reduce((s, w) => s + w.room_count, 0)
  const totalMembers  = workspaces.reduce((s, w) => s + w.member_count, 0)
  const totalBookings = workspaces.reduce((s, w) => s + w.booking_count, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#090d18', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: '40px 32px' }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;1,400&display=swap');` }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 500, fontFamily: "'Spectral', Georgia, serif", marginBottom: 4 }}>
            space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: 'system-ui, sans-serif', fontWeight: 400, marginLeft: 10, fontStyle: 'normal' }}>palantir</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
          </div>
        </div>
        <form action="/api/palantir/logout" method="POST">
          <button type="submit" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Sign out
          </button>
        </form>
      </div>

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 0 }}>
        {(['workspaces', 'tablets'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ fontSize: 12, padding: '8px 16px', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent', color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', letterSpacing: '0.04em', marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* Summary tiles */}
      <div style={{ display: tab === 'workspaces' ? 'grid' : 'none', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32, maxWidth: 480 }}>
        {[
          { label: 'Workspaces', value: workspaces.length },
          { label: 'Total members', value: totalMembers },
          { label: 'Total bookings', value: totalBookings },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{loading ? '…' : value}</div>
          </div>
        ))}
      </div>

      {/* Tablets view */}
      {tab === 'tablets' && (
        <div>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading workspaces…</div>
          ) : workspaces.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>No workspaces.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              {workspaces.map(w => {
                const rooms = roomsByWorkspace[w.id]
                return (
                  <div key={w.id}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{w.name ?? w.slug}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{w.slug}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>{w.room_count} room{w.room_count !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                      {rooms == null ? (
                        // Loading skeletons
                        Array.from({ length: Math.max(1, w.room_count) }).map((_, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ width: 320, height: 200, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Loading…</span>
                            </div>
                            <div style={{ height: 10, width: 80, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }} />
                          </div>
                        ))
                      ) : rooms.length === 0 ? (
                        <div style={{ width: 320, height: 200, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>No rooms</span>
                        </div>
                      ) : (
                        rooms.map(room => (
                          <div key={room.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div
                              onClick={() => window.open(`/${w.slug}/room/${room.id}`, '_blank')}
                              title={`Open ${room.name} tablet`}
                              style={{ width: 320, height: 200, overflow: 'hidden', position: 'relative', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                              <iframe
                                src={`/${w.slug}/room/${room.id}`}
                                style={{ width: 1280, height: 800, transform: 'scale(0.25)', transformOrigin: '0 0', border: 'none', pointerEvents: 'none' }}
                                tabIndex={-1}
                              />
                              {/* click overlay so pointer-events on iframe don't interfere */}
                              <div style={{ position: 'absolute', inset: 0 }} />
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', paddingLeft: 2 }}>
                              {room.name}
                              {room.room_type && <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>{room.room_type}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Workspace table */}
      {tab === 'workspaces' && (loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Workspace', 'Slug', 'Created', 'Rooms', 'Members', 'Bookings', 'Last activity', 'Limits', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workspaces.map(w => {
                const { label, color } = fmtActivity(w.last_booking_at)
                return (
                  <tr key={w.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 12px', fontWeight: 500 }}>
                      <a href={`/${w.slug}`} target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'none' }}>{w.name}</a>
                    </td>
                    <td style={{ padding: '12px 12px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 12 }}>{w.slug}</td>
                    <td style={{ padding: '12px 12px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{fmtDate(w.created_at)}</td>
                    <td style={{ padding: '12px 12px', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{w.room_count}</td>
                    <td style={{ padding: '12px 12px', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{w.member_count}</td>
                    <td style={{ padding: '12px 12px', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{w.booking_count}</td>
                    <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ color, fontSize: 12 }}>{label}</span>
                    </td>
                    <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                      {w.limits ? (
                        <span style={{ fontSize: 11, color: w.limits.is_trial ? '#f59e0b' : 'rgba(255,255,255,0.5)' }}>
                          {w.limits.is_trial ? 'Trial' : 'Custom'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Unlimited</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 12px', display: 'flex', gap: 6 }}>
                      <button onClick={() => openLimits(w)}
                        style={{ fontSize: 11, padding: '4px 10px', background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Limits
                      </button>
                      <button onClick={() => { setDeleteTarget(w); setDeleteSlug(''); setDeleteError('') }}
                        style={{ fontSize: 11, padding: '4px 10px', background: 'none', border: '1px solid rgba(255,100,100,0.3)', color: 'rgba(255,100,100,0.6)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {workspaces.length === 0 && (
            <div style={{ padding: '24px 12px', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>No workspaces yet.</div>
          )}
        </div>
      ))}

      {/* Pending deletion requests */}
      {tab === 'workspaces' && pendingDeletes.length > 0 && (
        <div style={{ marginTop: 48 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,100,100,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginBottom: 12 }}>
            Pending deletion requests
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingDeletes.map(req => {
              const ws = workspaces.find(w => w.id === req.workspaceId)
              return (
                <div key={req.workspaceId} style={{ background: 'rgba(255,100,100,0.06)', border: '1px solid rgba(255,100,100,0.2)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{req.workspaceName}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{req.workspaceSlug}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    <div>Requested by {req.requesterEmail}</div>
                    <div>{new Date(req.confirmedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setDeleteTarget(ws ?? { id: req.workspaceId, slug: req.workspaceSlug, name: req.workspaceName }); setDeleteSlug(''); setDeleteError('') }}
                      style={{ fontSize: 11, padding: '5px 12px', background: 'rgba(127,29,29,0.4)', border: '1px solid rgba(255,100,100,0.4)', color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Delete workspace
                    </button>
                    <button
                      onClick={() => handleDismissRequest(req.workspaceId)}
                      disabled={dismissingId === req.workspaceId}
                      style={{ fontSize: 11, padding: '5px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {dismissingId === req.workspaceId ? 'Dismissing…' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Limits modal */}
      {limitsTarget && (
        <div onClick={() => setLimitsTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.15)', padding: '28px 24px', width: 360, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Workspace limits</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>{limitsTarget.name ?? limitsTarget.slug}</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={limitsDraft.is_trial} onChange={e => setLimitsDraft(d => ({ ...d, is_trial: e.target.checked }))} />
              <span style={{ fontSize: 13, color: '#fff' }}>Trial workspace</span>
            </label>

            {(['max_rooms', 'max_members', 'max_bookings'] as const).map(field => (
              <div key={field} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {field === 'max_rooms' ? 'Max rooms' : field === 'max_members' ? 'Max members' : 'Max bookings (ever)'}
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="unlimited"
                  value={limitsDraft[field]}
                  onChange={e => setLimitsDraft(d => ({ ...d, [field]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
            ))}

            {limitsError && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{limitsError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setLimitsTarget(null)}
                style={{ flex: 1, padding: '9px 0', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handleSaveLimits} disabled={limitsSaving}
                style={{ flex: 1, padding: '9px 0', background: '#1e3a5f', border: 'none', color: '#93c5fd', fontSize: 13, fontWeight: 600, cursor: limitsSaving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {limitsSaving ? 'Saving…' : 'Save limits'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div onClick={() => setDeleteTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111827', border: '1px solid rgba(255,100,100,0.3)', padding: '28px 24px', width: 360, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
              Delete {deleteTarget.name}?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.5 }}>
              This permanently deletes the workspace, all its rooms, members, and bookings. Type the workspace slug to confirm.
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontFamily: 'monospace' }}>
              {deleteTarget.slug}
            </div>
            <input
              autoFocus
              value={deleteSlug}
              onChange={e => { setDeleteSlug(e.target.value); setDeleteError('') }}
              placeholder="type slug to confirm"
              style={{ width: '100%', padding: '9px 10px', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none', marginBottom: 8, boxSizing: 'border-box', fontFamily: 'monospace' }}
            />
            {deleteError && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{deleteError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setDeleteTarget(null)}
                style={{ flex: 1, padding: '9px 0', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting || deleteSlug !== deleteTarget.slug}
                style={{ flex: 1, padding: '9px 0', background: deleteSlug === deleteTarget.slug ? '#7f1d1d' : 'rgba(127,29,29,0.3)', border: 'none', color: deleteSlug === deleteTarget.slug ? '#fca5a5' : 'rgba(252,165,165,0.3)', fontSize: 13, fontWeight: 600, cursor: deleting || deleteSlug !== deleteTarget.slug ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
