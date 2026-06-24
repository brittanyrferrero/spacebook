# ADR-010: Design token system and palette presets in the booking page
Date: 2026-06-20
Status: Accepted

## Context

The booking calendar page (`app/[workspace]/(booking)/page.tsx`) uses inline styles
exclusively — no CSS modules, no Tailwind utility classes in the render tree. This
was a deliberate early choice: inline styles are co-located with the element they
style, easier to trace in a 2000-line file, and avoid the build-time CSS extraction
overhead on a large client component.

The downside is that visual constants were scattered across the file as top-level
`const` declarations (`ROSE`, `NAVY`, `BOOK_GREEN`, `PAST_BG`, etc.) and in the
`mkT(dark)` theme object. Changing the design meant hunting through a large file
for every colour reference. More importantly, there was no single place a future
workspace customisation feature could read from or write to.

In June 2026 the design direction shifted significantly ("Architect's Drawing"):
- Booking event colour changed from pure black to a softer dark gray
- "My bookings" accent moved to a specific pink
- Past time zones changed from a solid 30% black overlay to diagonal CSS hatching
- The now-line changed from 1px rose to 3px forest green with no dot/label
- Buttons became outlined (not filled)

Applying all of these by find-and-replacing individual constants was tedious and
fragile. The bigger concern was the future: the team wants to let workspaces choose
their own event colour and accent palette. There was no structure for that.

## Decision

**Add a `workspaceTheme` object and `PALETTE_PRESETS` array near the top of the
booking page**, before the existing constants.

```ts
const PALETTE_PRESETS = [
  { id: 'ink',    label: 'Ink',    eventColor: '#2e2e2e', myEventColor: '#c98a9a', accentColor: '#1a4030' },
  { id: 'slate',  label: 'Slate',  eventColor: '#3a4a5c', myEventColor: '#c98a9a', accentColor: '#2a3a4c' },
  { id: 'forest', label: 'Forest', eventColor: '#2d4a38', myEventColor: '#c98a9a', accentColor: '#1a3a28' },
  { id: 'warm',   label: 'Warm',   eventColor: '#4a3828', myEventColor: '#c98a9a', accentColor: '#6b4c30' },
]
const _activePreset = PALETTE_PRESETS[0]

const workspaceTheme = {
  eventColor:        _activePreset.eventColor,
  myEventColor:      _activePreset.myEventColor,
  accentColor:       _activePreset.accentColor,
  nowLineColor:      _activePreset.accentColor,
  nowLineWidth:      '3px',
  pastHatching:      'repeating-linear-gradient(-45deg, rgba(0,0,0,0.052) 0, rgba(0,0,0,0.052) 1px, transparent 1px, transparent 9px)',
  roomNameTransform: 'uppercase' as const,
  roomNameSpacing:   '1.5px',
  calendarRadius:    '12px',
}
```

The existing constants `ROSE` and `NAVY` now reference `workspaceTheme` rather than
hardcoded values, so nothing downstream changes — the token system is a new layer
above the existing constants, not a replacement of them.

**Why not CSS variables?** Because the styling is all inline React. CSS variables
would require either a `<style>` injection or a wrapper component to set them on a
root element, and then every inline style would need `var(--token)` strings. That's
more moving parts than a typed JS object, and it loses TypeScript autocomplete on
the token keys.

**Why not Tailwind custom tokens?** Tailwind is installed but not used in the booking
page render tree. The page predates the decision to use Tailwind and the existing
inline style system works; migrating would be a large refactor with high breakage risk
for no user-visible benefit. A typed JS object achieves the same goal: one source of
truth, easy to replace.

**Why a presets array and not just per-token settings?** Because "let a workspace pick
a colour" immediately produces ugly combinations. Presets enforce visual coherence —
the team curates what looks good and workspaces choose from those options. The presets
array also makes it easy to add new options without touching the consuming code.

## Consequences

**Better:** All visual customisation tokens live in one place. Changing the design
means editing `workspaceTheme`, not grepping the file.

**Better:** The `PALETTE_PRESETS` array is the contract for the future workspace
colour-picker feature. When that feature ships, the implementation is:
1. Store the active preset `id` in Redis (`ws:{workspaceId}:cfg:theme`)
2. Load it in the page (alongside the existing settings fetch)
3. Replace `PALETTE_PRESETS[0]` with `PALETTE_PRESETS.find(p => p.id === activeId) ?? PALETTE_PRESETS[0]`

**Better:** Dark mode is explicitly left alone — `workspaceTheme` only affects light
mode values. The `mkT(dark)` object controls dark mode independently. This is
intentional: the design iteration was for the light mode experience; dark mode has its
own established visual language.

**Risk:** `workspaceTheme` currently has no runtime validation. If a preset has a
malformed hex value, it will silently render wrong. If/when these values come from
the database, add validation before applying them.

**Tablet page not yet updated.** `app/[workspace]/room/[roomId]/page.tsx` still uses
its own hardcoded constants. When the tablet design is updated, the same token system
should be introduced there — ideally the presets array moves to a shared file both
pages import.

**Implementation files:**
- `app/[workspace]/(booking)/page.tsx` — lines 8–27 (PALETTE_PRESETS, workspaceTheme)
- Token consumers: `ROSE`, `NAVY` constants; `mkT()` pastHatch/pastBg; NowLine component; past overlay divs in DayView, WeekView, MonthView; filter chips; view toggle buttons; Book Now button
