'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function EnterWorkspacePage() {
  const { workspace } = useParams<{ workspace: string }>()
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    fetch(`/api/${workspace}/enter-set-cookie`).then(r => {
      if (r.ok) { window.location.href = `/${workspace}`; return }
      setInvalid(true)
    })
  }, [workspace])

  const wrap: React.CSSProperties = {
    height: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#090d18', fontFamily: 'system-ui, sans-serif', gap: 12,
  }

  if (!invalid) return null

  return (
    <div style={wrap}>
      <div style={{ fontSize: 22, fontWeight: 500, color: '#fff', letterSpacing: '0.02em', fontFamily: "'Spectral', Georgia, serif" }}>
        space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
      </div>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
        Workspace not found.
      </p>
    </div>
  )
}
