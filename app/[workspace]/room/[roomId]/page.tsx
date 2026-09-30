'use client'

import { useState, useEffect } from 'react'
import { ClassicRoomDisplay } from '@/components/tablet/ClassicRoomDisplay'

export default function RoomDisplayPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <ClassicRoomDisplay />
}
