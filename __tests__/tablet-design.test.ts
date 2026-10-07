import { describe, it, expect } from 'vitest'
import { resolveTabletDesign, isTabletDesign, tabletRoomUrl, DEFAULT_TABLET_DESIGN } from '@/lib/tablet-design'

describe('resolveTabletDesign', () => {
  it('defaults to classic when nothing is set, so shipping Linen changes nothing', () => {
    expect(DEFAULT_TABLET_DESIGN).toBe('classic')
    expect(resolveTabletDesign(undefined, null)).toBe('classic')
    expect(resolveTabletDesign(null, undefined)).toBe('classic')
  })

  it('uses the workspace setting', () => {
    expect(resolveTabletDesign('linen', null)).toBe('linen')
    expect(resolveTabletDesign('classic', null)).toBe('classic')
  })

  it('lets a per-tablet ?design= override win in both directions', () => {
    expect(resolveTabletDesign('classic', 'linen')).toBe('linen')
    expect(resolveTabletDesign('linen', 'classic')).toBe('classic')
  })

  it('ignores unrecognised values rather than breaking the tablet', () => {
    expect(resolveTabletDesign('linen', 'fancy')).toBe('linen')
    expect(resolveTabletDesign('fancy', null)).toBe('classic')
    expect(resolveTabletDesign({ design: 'linen' }, '')).toBe('classic')
  })
})

describe('isTabletDesign', () => {
  it('accepts only known designs', () => {
    expect(isTabletDesign('classic')).toBe(true)
    expect(isTabletDesign('linen')).toBe(true)
    expect(isTabletDesign('Linen')).toBe(false)
    expect(isTabletDesign(1)).toBe(false)
  })
})

describe('tabletRoomUrl', () => {
  const base = 'https://www.space-book.net/api/acme/t/abc123'
  it('goes to the room page', () => {
    expect(tabletRoomUrl('acme', 'r1', base).toString()).toBe('https://www.space-book.net/acme/room/r1')
  })
  it('carries a valid ?design= through, so the tablet link can pin a design', () => {
    expect(tabletRoomUrl('acme', 'r1', `${base}?design=linen`).toString()).toBe('https://www.space-book.net/acme/room/r1?design=linen')
    expect(tabletRoomUrl('acme', 'r1', `${base}?design=classic`).search).toBe('?design=classic')
  })
  it('drops anything else, so nothing can be smuggled into the redirect', () => {
    expect(tabletRoomUrl('acme', 'r1', `${base}?design=https://evil.example`).search).toBe('')
    expect(tabletRoomUrl('acme', 'r1', `${base}?design=linen&next=//evil.example`).toString()).toBe('https://www.space-book.net/acme/room/r1?design=linen')
    expect(tabletRoomUrl('acme', 'r1', base).origin).toBe('https://www.space-book.net')
  })
})
