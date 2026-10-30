// Which design the room-display tablets show. Chosen per workspace in admin, with a
// per-tablet `?design=` URL override for piloting (see ADR-021).

export const TABLET_DESIGNS = ['classic', 'linen'] as const
export type TabletDesign = typeof TABLET_DESIGNS[number]

// Linen is the default for every workspace (2026-10-22; Classic was the default during
// the pilot). Workspaces that explicitly saved Classic, and tablets with ?design=classic,
// keep Classic. Switching back is still just choosing Classic in admin.
export const DEFAULT_TABLET_DESIGN: TabletDesign = 'linen'

export function isTabletDesign(value: unknown): value is TabletDesign {
  return typeof value === 'string' && (TABLET_DESIGNS as readonly string[]).includes(value)
}

/** A valid `?design=` override wins; otherwise the workspace setting; otherwise the default. */
export function resolveTabletDesign(workspaceSetting: unknown, override: string | null | undefined): TabletDesign {
  if (isTabletDesign(override)) return override
  if (isTabletDesign(workspaceSetting)) return workspaceSetting
  return DEFAULT_TABLET_DESIGN
}
