'use client'

import { useState, useCallback } from 'react'
import { generateWorkspaceSlug } from '@/lib/words'

// Matches API-side SLUG_RE: lowercase letters/numbers/hyphens, start+end alphanumeric, 3–64 chars
const SLUG_RE = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$|^[a-z0-9]{3,64}$/

function validateSlug(val: string): string {
  if (!val) return 'Slug is required.'
  if (!/^[a-z0-9-]+$/.test(val)) return 'Only lowercase letters, numbers, and hyphens.'
  if (val.length < 3) return 'Minimum 3 characters.'
  if (val.length > 64) return 'Maximum 64 characters.'
  if (!SLUG_RE.test(val)) return 'Must start and end with a letter or number.'
  return ''
}

export default function LandingPage() {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [slug, setSlug] = useState(() => generateWorkspaceSlug())
  const [customMode, setCustomMode] = useState(false)
  const [customSlug, setCustomSlug] = useState('')
  const [customError, setCustomError] = useState('')
  const [showNotice, setShowNotice] = useState(false)

  const shuffle = useCallback(() => setSlug(generateWorkspaceSlug()), [])

  function handleCustomChange(val: string) {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setCustomSlug(cleaned)
    if (customError) setCustomError(validateSlug(cleaned))
  }

  function enterCustomMode() {
    setCustomSlug(slug)
    setCustomError('')
    setShowNotice(true)
    setCustomMode(true)
  }

  function exitCustomMode() {
    setCustomMode(false)
    setShowNotice(false)
    setCustomError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (customMode) {
      const err = validateSlug(customSlug)
      if (err) { setCustomError(err); return }
    }
    setError('')
    setCreating(true)
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          slug: customMode ? customSlug : slug,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong.')
        setCreating(false)
        return
      }
      const { slug: returnedSlug, admin_entry_token } = await res.json()
      const slugOk = typeof returnedSlug === 'string' && /^[a-z0-9-]{1,64}$/.test(returnedSlug)
      const tokenOk = typeof admin_entry_token === 'string' && /^[0-9a-f-]{36}$/.test(admin_entry_token)
      if (!slugOk || !tokenOk) { setError('Something went wrong. Please try again.'); return }
      window.location.href = `/admin-enter/${returnedSlug}/${admin_entry_token}`
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

          {/* Slug row */}
          <div>
            {customMode ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <input
                    style={{ ...inp, flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
                    value={customSlug}
                    onChange={e => handleCustomChange(e.target.value)}
                    onFocus={() => setShowNotice(true)}
                    placeholder="your-slug"
                    maxLength={64}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                  />
                </div>
                {customError && (
                  <p style={{ fontSize: 11, color: '#f87171', margin: '4px 0 0' }}>{customError}</p>
                )}
                {showNotice && !customError && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '4px 0 0', lineHeight: 1.5 }}>
                    Anyone who knows this URL can view your booking calendar.
                  </p>
                )}
                <button
                  type="button"
                  onClick={exitCustomMode}
                  style={{ marginTop: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 11, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                  ← back to random
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: 'rgba(255,255,255,0.55)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {slug}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
                  <button
                    type="button"
                    onClick={shuffle}
                    title="Shuffle"
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 15, cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>
                    ↻
                  </button>
                  <button
                    type="button"
                    onClick={enterCustomMode}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 11, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                    customize
                  </button>
                </div>
              </div>
            )}
          </div>

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
