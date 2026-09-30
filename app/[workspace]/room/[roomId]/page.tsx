'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { resolveTabletDesign, type TabletDesign } from '@/lib/tablet-design'

// Each tablet downloads only the design it shows
const ClassicRoomDisplay = dynamic(() => import('@/components/tablet/ClassicRoomDisplay').then(m => m.ClassicRoomDisplay), { ssr: false })
const LinenRoomDisplay   = dynamic(() => import('@/components/tablet/LinenRoomDisplay').then(m => m.LinenRoomDisplay), { ssr: false })

// Shows the workspace's chosen tablet design (ADR-021). A `?design=` query overrides it
// for one tablet. The choice is re-checked every 2 minutes, so switching in admin — in
// either direction — reaches every tablet without anyone touching them.
const RECHECK_MS = 2 * 60 * 1000

export default function RoomDisplayPage() {
  const { workspace } = useParams<{ workspace: string }>()
  const [design, setDesign] = useState<TabletDesign | null>(null)

  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get('design')
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(`/api/${workspace}/settings`)
        if (!res.ok) throw new Error(`settings ${res.status}`)
        const d = await res.json()
        if (!cancelled) setDesign(resolveTabletDesign(d.tabletDesign, override))
      } catch {
        // A failed check never flips a running tablet; on first load fall back to the override or Classic
        if (!cancelled) setDesign(prev => prev ?? resolveTabletDesign(null, override))
      }
    }
    check()
    const id = setInterval(check, RECHECK_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [workspace])

  if (!design) return null
  return design === 'linen' ? <LinenRoomDisplay /> : <ClassicRoomDisplay />
}
