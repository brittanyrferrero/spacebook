import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

export function durationMinutes(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60_000
}

export function gcalSubscribeUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarId)}`
}

// Fetches JSON expected to be an array; resolves to [] on a non-ok response, a
// non-array payload (e.g. an { error } object from a failed API route), or a
// network error — so callers can pipe this straight into `.filter()` without
// a transient failure crashing the page.
export async function fetchJsonArray<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
