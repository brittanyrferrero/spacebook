import { describe, it, expect } from 'vitest'
import { parseRecord, isOffline, likelyCause, recoveryNote, fmtDuration, OFFLINE_AFTER_MS } from '@/lib/tablet-health'

const T = '2026-10-22T14:00:00.000Z'
const ago = (ms: number) => new Date(Date.parse(T) - ms).toISOString()
const linen = { lastSeen: T, pageStartedAt: ago(3_600_000) }

describe('parseRecord', () => {
  it('normalises Upstash-deserialised values', () => {
    const rec = parseRecord({ lastSeen: T, pageStartedAt: T, battery: '42', charging: 0, lastEvent: 'hidden', offlineMs: 90000 })
    expect(rec).toMatchObject({ battery: 42, charging: false, lastEvent: 'hidden', offlineMs: 90000 })
  })
  it('rejects missing records and unknown events', () => {
    expect(parseRecord(null)).toBeNull()
    expect(parseRecord({ battery: 50 })).toBeNull()
    expect(parseRecord({ lastSeen: T, lastEvent: 'nope' })?.lastEvent).toBeUndefined()
  })
})

describe('isOffline', () => {
  it('flags a tablet only after the quiet threshold', () => {
    const now = new Date(T)
    expect(isOffline({ lastSeen: ago(OFFLINE_AFTER_MS - 1000) }, now)).toBe(false)
    expect(isOffline({ lastSeen: ago(OFFLINE_AFTER_MS + 1000) }, now)).toBe(true)
  })
})

describe('likelyCause', () => {
  it('explains Classic tablets report less', () => {
    expect(likelyCause({ lastSeen: T, lastSnapshotAt: T })).toMatch(/Classic/)
  })
  it('detects the page being closed', () => {
    expect(likelyCause({ ...linen, lastEvent: 'pagehide', lastEventAt: T })).toMatch(/page was closed/)
  })
  it('detects a flat battery', () => {
    expect(likelyCause({ ...linen, battery: 4, charging: false })).toMatch(/ran out of power.*4%/)
  })
  it('detects the screen sleeping or being switched off', () => {
    expect(likelyCause({ ...linen, lastEvent: 'hidden', lastEventAt: T, battery: 80, charging: true }))
      .toMatch(/screen went to sleep.*80% and charging/)
  })
  it('ignores a goodbye event that was followed by more heartbeats', () => {
    expect(likelyCause({ ...linen, lastEvent: 'hidden', lastEventAt: ago(10 * 60_000) })).toMatch(/lost contact suddenly/)
  })
})

describe('recoveryNote', () => {
  const alert = { alertedAt: T, lastSeen: ago(60 * 60_000) }
  it('reports a restart and a network drop after the outage began', () => {
    const note = recoveryNote({ ...linen, pageStartedAt: T, offlineMs: 45 * 60_000, offlineReportedAt: T }, alert)
    expect(note).toMatch(/rebooted/)
    expect(note).toMatch(/network connection for about 45 minutes/)
  })
  it('says nothing when it has nothing new to say', () => {
    expect(recoveryNote({ ...linen, pageStartedAt: ago(2 * 3_600_000) }, alert)).toBe('')
  })
})

describe('fmtDuration', () => {
  it('scales units', () => {
    expect(fmtDuration(60_000)).toBe('1 minute')
    expect(fmtDuration(3 * 3_600_000)).toBe('3 hours')
    expect(fmtDuration(4 * 86_400_000)).toBe('4 days')
  })
})
