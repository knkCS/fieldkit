# Build Canvas — Overlay Insertion Boundaries

**Date:** 2026-07-05
**Status:** Approved design
**Context:** Field gaps on the Build canvas measure ~70px because every
field boundary reserves a 24px hover-⊕ row inside the `Stack gap="5"`
(user report with screenshot, 2026-07-05). The canvas should match the
renderer's 20px rhythm — that's the WYSIWYG promise.

## Decision (Option A of four mocked alternatives)

Replace the in-flow insertion rows with hover-revealed overlay
boundaries (Notion-style):

1. `renderFields` renders ONLY shells as Stack children (`gap="5"`
   unchanged). Build-mode field rhythm becomes identical to `SpecForm`.
2. New `InsertionBoundary` component: absolutely positioned, full width,
   ~20px tall, centered on the gap above each shell (position 0 overlays
   the panel's top padding). Invisible by default; `_hover` /
   `_focusWithin` reveal a primary (`accent`) hairline with the centered
   ⊕ `TypePickerPopover` trigger. Overlay = occupies the empty gap, never
   displaces content; pointer events limited to its own strip.
3. One trailing boundary per tab after the last field (a real ~20px flow
   element — there is no gap to overlay at a list's end). The only
   reserved space that remains.
4. Empty-tab / empty-spec keep the labeled always-visible drop zone.
5. Insert logic unchanged: same `TypePickerPopover`, `flatInsertIndex`,
   `createField`, select + label-focus behavior.
6. Keyboard: ⊕ buttons remain in the DOM, Tab-reachable, revealed on
   focus (`_focusWithin`), exactly as today.

## Rejected alternatives

- B: hairline + persistent dashed end-of-tab "Add field" button
  (recommended for discoverability; owner chose the cleaner A).
- C: toolbar "insert below" + end button (two-step insertion).
- D: shrink reserved rows to 8px (rhythm still ≠ renderer).

## Testing

- Existing insertion tests keep passing (buttons remain queryable,
  N+1 per tab).
- The `_focusWithin` stylesheet regression test moves to
  `InsertionBoundary`.
- New regression: the fields `Stack`'s flow children are shells only
  (no insertion rows) — pins the gap fidelity.
- Runtime check in Storybook: visual gap ≈ 20px; hover/focus reveal.
