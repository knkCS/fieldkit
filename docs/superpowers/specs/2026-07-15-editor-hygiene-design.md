# Editor Hygiene Bundle — Design

**Date:** 2026-07-15
**Status:** Approved (recommendation accepted verbatim; closes fieldkit#45, fieldkit#46, plus the #39-class deflake for insertion/try-it)
**Ships as:** fieldkit 0.13.0 (behavior additions, no API change, no new label keys)

## Decisions

1. **#45 — far-outside drags resolve nothing.** `editorCollision` gains a
   bounds guard for pointer drags: compute the union bounding box of all
   VISIBLE droppable rects (zero-rect hidden containers excluded — they sit
   at (0,0) and would drag the union to the page origin), expand it by
   `OUTSIDE_CANVAS_SLACK_PX = 96`, and if the pointer falls outside, return
   NO collisions. dnd-kit then reports `over: null` → the 0.12.0 machinery
   does the rest: line/tint/highlight clear, an armed spring cancels, a
   release is a null drop (schema untouched, drag-start tab restored).
   Keyboard drags carry no pointer coordinates and bypass the guard. The
   union includes the tab-strip zones, so hovering triggers stays inside
   bounds; the slack absorbs the strip-to-panel gutter and edge dragging.
2. **#46 — card moves auto-wrap, mirroring insertCard.** When
   `moveCardToSection`'s target tab (post-removal) has fields but NO card
   marker, insert an untitled card marker at the tab's head (wrapping all
   its fields — exactly `insertCard`'s wrap step, same `nextAccessor`
   uniquing) before appending the moved block at the end. Already-carded
   targets are untouched (their fields are already all-in-cards). The
   editor's own actions can no longer produce `loose_field_in_carded_tab`;
   the validateSpec rule remains for hand-written schemas, and the 0.12.0
   docs wording (validate-spec comment + mdx) reverts to that claim.
3. **Deflake insertion/try-it** (third #39-class instance, failed under
   heavy machine load 2026-07-15): apply the established generous-timeout
   treatment (the 53db1d7 idiom) to the specific awaited assertions that
   timed out; no behavior change.

## Testing

- #45 units (visible-collision.test.ts, real geometry): pointer inside
  union → unchanged behavior; outside union+slack → `[]`; hidden zero-rects
  excluded from the union; keyboard (null coords) unaffected.
- #46 units (draft-ops.test.ts): move into an uncarded tab with fields →
  wrap marker + block appended, `validateSpec` reports NO
  loose_field_in_carded_tab; already-carded target → no wrap; empty target
  → no wrap. The 0.12.0 3-tab regression test's expected order updates
  deliberately (its fixture's flagged state is exactly what #46 removes).
- Runtime probe: re-run the 0.12.0 gate's failed margin legs — post-spring
  far-margin must now clear feedback mid-drag and restore on release; spot
  re-check dwell/spring/quick-drop legs (bounds must not break the strip).

## Non-goals

Distance-based collision rework beyond the bounds guard; wrapping
hand-written pathological targets (carded tabs with loose leading fields);
any renderer/table change.
