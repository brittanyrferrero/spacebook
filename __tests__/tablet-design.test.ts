import { describe, it, expect } from 'vitest'
import { resolveTabletDesign, isTabletDesign, DEFAULT_TABLET_DESIGN } from '@/lib/tablet-design'

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
