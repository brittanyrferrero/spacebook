// Which design the room-display tablets show. Chosen per workspace in admin, with a
// per-tablet `?design=` URL override for piloting (see ADR-021).

export const TABLET_DESIGNS = ['classic', 'linen'] as const
export type TabletDesign = typeof TABLET_DESIGNS[number]

// Classic stays the default so shipping the Linen code changes nothing until an
// admin opts in — and switching back is just choosing Classic again.
export const DEFAULT_TABLET_DESIGN: TabletDesign = 'classic'

export function isTabletDesign(value: unknown): value is TabletDesign {
  return typeof value === 'string' && (TABLET_DESIGNS as readonly string[]).includes(value)
}

/** A valid `?design=` override wins; otherwise the workspace setting; otherwise the default. */
export function resolveTabletDesign(workspaceSetting: unknown, override: string | null | undefined): TabletDesign {
  if (isTabletDesign(override)) return override
  if (isTabletDesign(workspaceSetting)) return workspaceSetting
  return DEFAULT_TABLET_DESIGN
}
