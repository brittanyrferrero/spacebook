'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function EnterTokenPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  useEffect(() => {
    fetch(`/api/enter-check?token=${token}`).then(r => setTokenValid(r.ok))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const memberRes = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      })

      if (!memberRes.ok && memberRes.status !== 409) {
        const text = await memberRes.text()
        let msg = 'Something went wrong.'
        try { msg = JSON.parse(text)?.error ?? msg } catch { /* empty body */ }
        setError(msg)
        setSubmitting(false)
        return
      }

      await fetch(`/api/enter-set-cookie?token=${token}`)
      router.push('/')
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)',
    color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  if (tokenValid === null) return null

  if (!tokenValid) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090d18', fontFamily: 'system-ui, sans-serif', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
          space<span style={{ color: '#db95ab', fontWeight: 300 }}>book</span>
        </div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          This invite link is invalid.
        </p>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090d18', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 340, padding: '0 24px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 8 }}>
          space<span style={{ color: '#db95ab', fontWeight: 300 }}>book</span>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', margin: '0 0 28px' }}>
          Enter your details to get access
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            style={inp}
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
          />
          <input
            style={inp}
            type="email"
            placeholder="Your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          {error && <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim() || !email.trim()}
            style={{ marginTop: 4, padding: '11px 0', borderRadius: 8, border: 'none', background: '#db95ab', color: '#fff', fontSize: 14, fontWeight: 500, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit' }}>
            {submitting ? 'Entering…' : 'Enter workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
