# ADR-013: Modal scroll required two independent fixes, not one
Date: 2026-07-01
Status: Accepted

## Context

The "Book Now" / "Schedule for later" modal (`app/[workspace]/(booking)/page.tsx`) renders a fixed backdrop (`position: fixed, inset: 0`) that centers a modal card with `display: flex; align-items: center; justify-content: center`. The modal card itself had no `maxHeight` or `overflow` — it sized to its content and relied on the flex centering to stay on screen.

The "Schedule for later" branch has a Room field near the bottom of the form: a hand-rolled dropdown (not a native `<select>`, not a portal) — a button that toggles a `position: absolute` popover (`top: 100%`, `maxHeight: 220`, `overflowY: auto`) anchored to a `position: relative` wrapper in the form's normal flow. Closing the popover on an outside click was implemented with a second element: a transparent `position: fixed; inset: 0; z-index: 10` div rendered as a sibling of the popover, with an `onClick` that closed it.

Reported bug: when the modal's content (form fields plus the open room dropdown) exceeded the viewport height, room types past the first group (e.g. "Meeting Room") were invisible and **unreachable** — no scroll gesture revealed them.

## Two separate bugs, not one

**Bug 1 — the modal had no scroll container at all.** The modal card had no `maxHeight`/`overflow`, so oversized content simply extended past the fixed-position backdrop's viewport bounds with no scrollbar and no scroll mechanism. Fixed-position elements are sized relative to the *viewport*, not the document — a `fixed` box with content taller than the viewport doesn't get a native scrollbar, because it isn't part of any scrollable document flow. Fix: added `maxHeight: '85vh', overflowY: 'auto'` to the modal card itself, making the modal (not the popover) the scroll container. 85vh leaves a visible backdrop margin on tall screens while guaranteeing headroom on short ones.

**This fix alone did not resolve the bug.** It was verified against an isolated HTML/CSS reproduction (same style values, same room-group data) and appeared correct — `scrollTop` moved from `0` to full `scrollHeight` when scrolled programmatically. But testing against the actual running app (`swift-cedar-lake` workspace, driven with Playwright, real mouse-wheel events instead of a scripted `scrollTop` assignment) showed the bug persisted exactly as reported. **The isolated reproduction missed a second bug because it didn't include the outside-click-catcher element** — it only reproduced the popover's visual structure, not its full interactive DOM.

**Bug 2 — the outside-click catcher blocked scroll-chaining to the modal.** The click-away div (`position: fixed; inset: 0; z-index: 10`, rendered only while the dropdown is open) sits on top of the entire viewport, including the rest of the modal, the instant the dropdown opens. `document.elementFromPoint()` confirmed that a wheel gesture anywhere over the modal — even far from the popover itself — hit this div, not the modal's content. Because the div is `position: fixed`, it does not establish or belong to the modal's scrollable flow; wheel events over it were not scroll-chained to the modal's `overflow: auto` container the way they would be over a normal in-flow element. Net effect: **the instant the dropdown opened, scrolling the modal any further stopped working entirely**, regardless of Bug 1's fix. This matches the report precisely — the user could open the dropdown, but from that point on, no scroll gesture reached rooms further down the list.

Fix: removed the fixed-position click-catcher entirely. Replaced it with a `document`-level `mousedown` listener (added only while `laterRoomOpen` is true) that closes the dropdown when the click target falls outside a `ref`-tracked wrapper (`laterRoomRef`, attached to the `position: relative` anchor div). No element now sits over the modal to intercept scroll.

## Decision

Both fixes are required together:
1. `maxHeight: '85vh', overflowY: 'auto'` on the modal card (`app/[workspace]/(booking)/page.tsx`, the div immediately inside the fixed backdrop) — gives the modal somewhere to scroll to.
2. Replace the room dropdown's fixed-position click-catcher with a `document.addEventListener('mousedown', ...)` + ref-based outside-click check — removes the element that was silently swallowing scroll input the moment the dropdown opened.

## Consequences

**Better:** The room dropdown, and any future modal content that grows, is reachable by scrolling regardless of viewport height, even while the dropdown is open.

**Scoped fix, not systemic:** Only the "Schedule for later" room dropdown's click-catcher was converted to the document-listener pattern. Any other hand-rolled dropdown/popover in this codebase that uses the same `position: fixed; inset: 0` click-catcher trick (grep for `position: 'fixed', inset: 0` inside a modal, distinct from the modal *backdrops* themselves, which are the outermost layer and don't have this problem) will have the same scroll-blocking bug and needs the same conversion. There is no shared `Modal`/`Dropdown` component to centralize this in — see [issue #150](https://github.com/brittanyrferrero/spacebook/issues/150) for the proposal to extract one.

**No workspace/tier/scale surface touched:** Pure client-side DOM/CSS change. Confirmed via scale-check — no query, cache key, or limit logic involved.

## Revision — collision-aware positioning instead of relying on modal scroll

With bugs 1 and 2 both fixed, the dropdown was technically reachable, but the UX was wrong: opening the dropdown required scrolling the *entire modal*, which moved the Room field itself (and everything above it) out of view. The user has to lose their place in the form to see the options they just asked to see — disorienting, and not how any native or well-built dropdown behaves. A dropdown should stay anchored to where it was opened and scroll *itself*, not drag the surrounding form around it.

The popover already had its own `overflowY: 'auto'` with a fixed `maxHeight: 220` — that part was always correct. What it lacked was **collision detection**: it always rendered `top: 100%` (opening downward) at a fixed height, with no awareness of how much viewport space was actually available below the button.

Fix: `toggleLaterRoomOpen()` measures `laterRoomRef.current.getBoundingClientRect()` at the moment the dropdown opens and computes, against `window.innerHeight`:
- **Direction** — open downward (`top: 100%`) if there's reasonable space below; flip to open upward (`bottom: 100%`) if space below is tight (< 120px) and there's more room above.
- **Height** — clamp `maxHeight` to whichever space (above or below, matching the chosen direction) is actually available, capped at the original 220px, floored at 80px so the list is never so short it's useless.

This is computed once, on open (not reactively on scroll/resize) — consistent with how the rest of this codebase handles ephemeral UI state, and sufficient because the anchor's position is stable while the dropdown is open (the modal itself doesn't scroll anymore as a side effect of opening it).

**Net effect:** the Room button never moves when the dropdown opens. The popover renders fully within the visible viewport in whichever direction has room, and its own internal scrollbar (unchanged) handles the case where there are more rooms than fit even at the clamped height. The modal-level `maxHeight`/`overflow` fix from earlier in this ADR is kept as a general defensive fallback for other content in the modal (e.g. a very long recurring-conflict list on a short viewport) — it's just no longer what makes the room dropdown itself usable.

## What to check next time

**If you add another hand-rolled dropdown/popover:** don't use a full-screen `position: fixed; inset: 0` div as the outside-click catcher if the popover lives inside anything scrollable. It will silently block scroll-chaining to that ancestor the moment it renders. Use a `document`-level `mousedown`/`click` listener with a ref-based "is the click inside this element" check instead — it has no visual/hit-testing footprint, so it can't interfere with scroll.

**If you're debugging a "can't scroll" report and an isolated CSS-only reproduction says it should work:** that reproduction is only trustworthy if it includes every interactive element that appears in the same DOM state as the real bug — not just the static visual structure. This bug specifically hid behind an element (the click-catcher) that only exists conditionally, while the dropdown is open, and has zero visual presence (it's invisible). A reproduction built by eyeballing the rendered output will miss invisible elements like this; testing against the real running app with real input events (not scripted `scrollTop` assignments) is what actually surfaced it.

**"Technically scrollable" isn't the same bar as "feels right."** The first working fix (modal-level scroll) passed every check — reachable, no console errors, verified against the live app — but was still wrong, because it made the *whole modal* move to reveal a dropdown the user opened in place. A popover should scroll itself; it shouldn't require relocating the control that opened it. When a fix makes something reachable only by moving unrelated UI out of the way, that's a sign the fix landed one layer too high (the modal) instead of at the component that actually owns the problem (the popover's own positioning).
