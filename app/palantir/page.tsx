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
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleteSlug, setDeleteSlug] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    fetch('/api/palantir/workspaces')
      .then(r => r.json())
      .then(data => { setWorkspaces(data); setLoading(false) })
  }, [])

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
      setDeleteTarget(null)
      setDeleteSlug('')
    } else {
      const err = await res.json().catch(() => ({}))
      setDeleteError(err.error ?? 'Something went wrong.')
    }
    setDeleting(false)
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

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32, maxWidth: 480 }}>
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

      {/* Workspace table */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Workspace', 'Slug', 'Created', 'Rooms', 'Members', 'Bookings', 'Last activity', ''].map(h => (
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
                    <td style={{ padding: '12px 12px' }}>
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
