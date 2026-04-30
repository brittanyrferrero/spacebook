'use client'

import { useState, useEffect, useRef } from 'react'

type User = { name: string; email: string }

interface Props {
  value: string
  onChange: (name: string) => void
  onSelect: (user: User) => void
  style?: React.CSSProperties
  placeholder?: string
}

let cachedUsers: User[] | null = null

export function NameAutocomplete({ value, onChange, onSelect, style, placeholder = 'e.g. Jamie Lee' }: Props) {
  const [users, setUsers] = useState<User[]>(cachedUsers ?? [])
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cachedUsers) return
    fetch('/users.json').then(r => r.json()).then((data: User[]) => {
      cachedUsers = data
      setUsers(data)
    }).catch(() => {})
  }, [])

  const query = value.trim().toLowerCase()
  const matches = query.length >= 1
    ? users.filter(u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)).slice(0, 6)
    : []

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        style={style}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setFocused(true); setOpen(true) }}
        onBlur={() => setFocused(false)}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '0.5px solid #D0D4D8', borderRadius: 8,
          marginTop: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.10)', overflow: 'hidden',
        }}>
          {matches.map(u => (
            <button
              key={u.email}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(u); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', border: 'none', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F2')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{u.name}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{u.email}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
