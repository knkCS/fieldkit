# Spring-Loaded Sections — Design

**Date:** 2026-07-14
**Status:** Approved (brainstormed with Jesko after the 0.11.2 tab-drop
reachability fix; model A chosen over drop-then-follow, with the
follow-after-quick-drop detail folded in)
**Ships as:** fieldkit 0.12.0 (minor: new cross-section drag interaction,
no API breaks, no new label keys)

## Motivation

Cross-section moves exist but are blunt: a field dropped on a section tab
lands at the END of that section (pointer-reachable only since 0.11.2 —
`editorCollision`), with no way to place it at an exact slot in one
gesture, and the canvas does not follow the drop (the item vanishes from
the visible tab — the exact "nothing seems to happen" confusion from the
2026-07-14 field report). Card blocks cannot cross sections at all (the
0.8.0 guard) — not by drag, not by menu.

## Decisions (locked)

1. **Spring-loaded tabs (model A).** While dragging a field or card
   block, resting the pointer on a tab trigger's drop zone for a dwell
   (~500 ms, ONE tuned constant) switches the visible section to that
   tab; the drag continues uninterrupted and the existing 0.11.0
   feedback (insertion line, card tint) guides to the exact slot.
   Springs chain: hovering another trigger later in the same drag
   springs again.
2. **Quick drop stays.** Releasing on a trigger BEFORE the dwell keeps
   today's semantics: append at the end of that section (fields: after
   the tab's last field — inside its last card when carded, via the
   existing `moveFieldToSection`; cards: whole block appended after the
   tab's last element via the new `moveCardToSection`).
3. **Every cross-section drop ends in the target section.** Spring drops
   are already there; quick drops FOLLOW: `activeTabIndex` switches to
   the target tab, the moved item is selected and scrolled into view.
4. **Escape restores.** Cancel leaves the schema untouched AND restores
   the section that was active at drag START — a spring is a preview
   until the drop commits. A successful drop stays on the sprung/target
   tab.
5. **Cards cross sections.** The 0.8.0 cross-tab guard is retired,
   replaced by intentional targets only: (a) tab triggers (quick drop:
   block append + follow), (b) between-frames slots of the CURRENTLY
   VISIBLE tab after a spring. Hidden panels' droppables stay filtered
   (`isVisibleDroppable`), so accidental cross-tab card moves remain
   impossible. The card ⋯ menu additionally gains "Move to section…"
   (reuses the `moveToSection` label key; submenu of the other sections,
   same shape as the field toolbar's folder menu; menu moves = block
   append + follow-select).
6. **Keyboard parity, no dwell.** Keyboard drags landing on a tabdrop
   zone switch the visible section IMMEDIATELY (dwell is a
   pointer-safety device against drive-by springs; keyboard navigation
   is already deliberate). Further arrows walk the sprung tab's slots
   for exact placement; dropping while on the zone = quick-drop
   semantics. Escape restores the drag-start tab, same as pointer.
7. **No dwell-progress affordance.** The trigger keeps its existing
   `primary.subtle` highlight while it is the resolved target; the
   spring simply fires. (YAGNI — revisit only on real confusion.)

## Architecture

- **`src/editor/use-spring-loaded-tab.ts` (new):** small hook owning the
  dwell timer. Input: the live target (kind `"tab"` + `tabIndex`) and an
  enabled flag (pointer drags only); output: `onSpring(tabIndex)`
  callback firing after the dwell. Cancels on target change, drag end,
  and unmount. Independently testable with fake timers.
- **`EditorCanvas`:** records `dragStartTabIndex` in `onDragStart`;
  spring and follow both go through the existing controlled
  `activeTabIndex`/`onActiveTabChange` (lifted to SpecEditor in 0.9.0);
  `handleDragCancel` restores the recorded tab. `handleDragEnd`'s tab
  case appends then follows (select + scroll the moved accessor).
  Keyboard immediate-switch happens where the live tab target is set.
- **`resolveDropTarget`:** the card branch's tabdrop early-return
  becomes a `{kind: "tab"}` target for cards; card block targets in the
  visible (sprung) tab resolve exactly like today's same-tab case —
  cross-tab is no longer distinguishable at resolution level because the
  sprung tab IS the visible tab. The tab-index guard that enforced
  same-tab card moves is deleted.
- **`draft-ops`:** new `moveCardToSection(schema, cardAccessor,
  tabIndex)` — extracts the marker plus its block (up to the next
  card/section marker) and appends after the target tab's last element.
  `moveFieldToSection` reused unchanged for fields.
- **`DndContext` measuring:** springing swaps which panel is visible
  mid-drag, so droppable rects must re-measure. Use dnd-kit's
  `measuring={{droppable: {strategy: …}}}` — `WhileDragging` vs `Always`
  decided by an implementation-time probe (correctness first, then
  cheapest strategy that re-measures on the swap).
- **Labels:** none added. The card menu item reuses `moveToSection`.

## Testing

- Unit: spring hook (fires after dwell, cancels on target change/drag
  end, chains, disabled for keyboard), `moveCardToSection` (block
  extraction incl. empty card, last-block, adjacent-marker edges).
- RTL (each discriminating): dwell elapses → active tab switches while
  drag stays live (fake timers); Escape after a spring restores the
  drag-start tab AND schema; quick drop on a trigger appends + switches
  + selects the moved item; keyboard landing on a tabdrop zone switches
  immediately (no timer); after a spring, a card block drops between the
  foreign tab's frames (end-state schema pin); card ⋯ menu "Move to
  section…" moves the block + follows.
- Runtime gate (pointer legs, extending the 2026-07-14 checklist
  addition): real spring gesture — hover a trigger past the dwell, tab
  switches, drop at an interior slot of the foreign section (schema
  end-state verified); crossing the tab strip quickly does NOT spring;
  quick drop + follow-select; card spring drop between frames; Escape
  after spring restores origin tab; keyboard parity leg.

## Non-goals

Section reordering by drag (menu covers it); auto-scroll during drag;
dwell progress indicators; multi-select drags; renderer/table changes.
