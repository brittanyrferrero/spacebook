'use client'

import { useState } from 'react'

export default function LandingPage() {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined }),
      })
      if (!res.ok) { setError('Something went wrong.'); setCreating(false); return }
      const { slug, admin_entry_token } = await res.json()
      const slugOk = typeof slug === 'string' && /^[a-z0-9-]{1,64}$/.test(slug)
      const tokenOk = typeof admin_entry_token === 'string' && /^[0-9a-f-]{36}$/.test(admin_entry_token)
      if (!slugOk || !tokenOk) { setError('Something went wrong. Please try again.'); return }
      window.location.href = `/admin-enter/${slug}/${admin_entry_token}`
    } catch {
      setError('Something went wrong. Please try again.')
      setCreating(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 0,
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)',
    color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090d18', fontFamily: 'system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;1,400&display=swap');` }} />
      <div style={{ width: '100%', maxWidth: 340, padding: '0 24px' }}>
        <div style={{ fontSize: 28, fontWeight: 500, color: '#fff', letterSpacing: '0.02em', textAlign: 'center', marginBottom: 8, fontFamily: "'Spectral', Georgia, serif" }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', margin: '0 0 32px' }}>
          Room booking for your team
        </p>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            style={inp}
            placeholder="Workspace name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={200}
            autoFocus
          />
          {error && <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={creating}
            style={{ marginTop: 4, padding: '11px 0', borderRadius: 0, border: 'none', background: '#db95ab', color: '#fff', fontSize: 14, fontWeight: 500, cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.7 : 1, fontFamily: 'inherit' }}>
            {creating ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
