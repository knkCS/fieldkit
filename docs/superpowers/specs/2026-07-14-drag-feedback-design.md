# Drag Feedback Rework — Design

**Date:** 2026-07-14
**Status:** Approved (root-caused from Jesko's screenshots via instrumented reproduction; preview model + highlight chosen in the visual companion)
**Ships as:** fieldkit 0.11.0 (drag-feedback model change; zero API delta, semver honesty)

## Motivation (measured root causes)

Mid-drag visuals in the editor canvas are broken since cards made list
heights heterogeneous:

1. **Scale artifact:** with no `DragOverlay`, dnd-kit scales the dragged
   node to the hovered slot's size. Measured: field over field
   `scaleY 0.767`; card over field `scaleY 0.332`; field over a ~300px
   card ≈ `3.5×` — the giant distorted text in the report screenshots.
2. **Frame escape:** the canvas is one flat sortable list (markers +
   fields — the data model, unchanged) but the DOM nests fields inside
   card frames; `verticalListSortingStrategy` translates each item
   independently. Measured: a card frame translated −301px while its own
   child moved −151px — the child floating 150px outside its frame,
   overlapping other content (the stacked grips / overlapping labels in
   the screenshots).

## Decisions (locked)

1. **DragOverlay** (portal): a fixed-size clone of the dragged shell
   follows the pointer (shadow + slight tilt for lift). For card
   block-drags the clone is the HEADER BAR ONLY plus a "+ N fields"
   count hint (a full 300px frame clone would occlude the canvas). The
   in-list original stays in place, dimmed (opacity ~0.35, dashed
   border). The real node never receives a drag transform → the scale
   artifact is dead at the root.
2. **The list holds still** (preview model B): non-active items get NO
   transforms during a drag (no reflow preview). Frame escape becomes
   structurally impossible. Drop SEMANTICS are untouched — the
   handleDragEnd card branch, field-over-frame snap, cross-tab guard,
   and tabdrop targets all behave exactly as today.
3. **Indicator line:** during a drag, the resolved drop target renders a
   3px accent line with an end-dot at the exact insertion point —
   between shells, between card frames, at a card's top when dropping
   into its first slot, inside empty cards. Cross-tab moves highlight
   the tab trigger (no line). The line's position derives from the SAME
   resolution as handleDragEnd's target (one source of truth, pinned by
   a test deriving both from the same function).
4. **Drop-target card highlight (treatment A):** the card containing the
   resolved drop target washes with a soft accent background tint
   (token-based, e.g. accent-subtle). Rules: derived from the same
   resolved target as the line (never disagree); exactly ONE card
   highlighted during a field drag in a carded tab (all-in-cards
   guarantees every drop lands in some card); empty cards tint + line at
   top; card BLOCK-drags highlight nothing (their line sits between
   frames). Must not impersonate selection: the tint touches the
   background only, never the border (selection keeps the solid accent
   border channel).
5. **Keyboard drags get the identical treatment** — overlay at the
   virtual position, line + tint at the announced slot. (Today keyboard
   drags jump with zero preview; this is the a11y win of the rework.)

## Architecture

- `EditorCanvas` gains a `DragOverlay` (from @dnd-kit/core) rendered
  inside the existing `DndContext`; the clone component reuses the
  shell's presentational interior (a lightweight `ShellDragPreview` /
  `CardDragPreview` pair — new, presentational-only, displayName per
  convention).
- The strategy: replace `verticalListSortingStrategy` with a no-op
  strategy (`() => null`) or per-item `transform: null` — verify which
  shape dnd-kit's `useSortable` needs so `transition` doesn't linger.
  `CSS.Transform` serialization on shells/frames becomes moot but is
  swapped to `CSS.Translate` anyway (belt).
- Drop-target resolution is extracted from `handleDragEnd` into a pure
  `resolveDropTarget(over, active, draft/partition)` used by BOTH the
  end handler and the live indicator/tint (via onDragOver state). The
  indicator renders through the existing insertion-boundary geometry.
- Dim/tint styles: semantic tokens only.

## Testing

- jsdom pins: overlay presence during drag (portal content); origin
  dimmed; neighbors carry NO transform mid-drag (the Finding-2 pin);
  indicator position equals resolveDropTarget's answer for
  representative cases (between shells / into card top / empty card /
  between frames for a block drag); exactly-one-tint rule incl. the
  block-drag none case; keyboard-drag parity for the indicator.
- The definitive check is the runtime gate re-running the instrumented
  probes from the investigation: scaleY must measure 1.0 on every node
  in every drag scenario; child-vs-frame relative displacement must
  measure 0; plus screenshots for the eyeball.
- Existing dnd/cards-canvas suites keep passing with only mid-drag
  assertion updates (end-state assertions untouched — drop semantics
  frozen).

## Non-goals

Reflow/slide animation (deliberately rejected — model B chosen);
any change to drop semantics or the flat-list data model; section
tab-strip dnd beyond what exists; renderer/table changes.
