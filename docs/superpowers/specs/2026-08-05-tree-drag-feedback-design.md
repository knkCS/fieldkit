# Reference Tree Drag Feedback — Design

**Date:** 2026-08-05
**Status:** Approved (root-caused from a report that the drop level is unreadable; scope and treatment settled in a grilling session)
**Ships as:** a Reference Tree feedback change; zero API delta

Sibling to [the editor canvas's drag-feedback rework](./2026-07-14-drag-feedback-design.md), whose Decisions 1–3 this borrows from selectively rather than wholesale. Where the two differ, the difference is deliberate and stated below.

## Motivation (root cause)

**The tree already draws the landing depth, and then buries it.**

During a drag the dragged row's horizontal position is the sum of two things:

1. `CSS.Translate.toString(transform)` — for the *active* item, dnd-kit's `useSortable` returns the raw drag delta, **both axes**, and the tree applies it unmodified;
2. `ml: projectedDepth × INDENT_WIDTH` — the depth the release would actually land at, which is quantised in 32px steps.

So a continuous pointer travel of any size rides on top of a 32px quantised nudge. The signal that answers "what level will this land at" is present in the DOM on every frame, and is swamped by the signal that answers "where is the mouse". The editor canvas does not have this problem because it kills transforms outright (`noopSortingStrategy`) and lets an overlay carry the movement.

Two secondary gaps follow from the same place:

- **Nothing marks the landing slot.** The parting list implies it, but the tree has no equivalent of the canvas's indicator line.
- **In-place re-indent is invisible.** The tree permits changing a Reference's depth without moving it — the one interaction knkCMS core cannot do at all — and today the only evidence is a 32px margin shift on a half-opacity row.

## Decisions (locked)

1. **Suppress horizontal translation on the dragged row.** Its `transform` carries the vertical component only, so its indent reflects the projected depth and nothing else. This changes appearance only: the projection's input is `event.delta.x`, read from the drag event, and is untouched — ←/→ keep changing depth exactly as before, and become *more* legible, not less.

2. **Keep the list parting.** `verticalListSortingStrategy` stays; rows continue to displace to show where the drop lands. This is the deliberate divergence from the canvas's Decision 2 — the canvas needed a still list because flat-strategy translations escaped its nested card frames, a problem the tree's flat DOM does not have. The tree's parting list is a feature, and the indicator supplements it rather than replacing it.

3. **The dragged row stays visible, dimmed, and indented to the projected depth.** Unlike knkCMS core, which collapses the dragged row into a bar and so gives an Author no way to tell which Reference is in flight (its `DragOverlay` is mounted but renders nothing — `RelatedItem` opens `return (!isOverlay && (…))`, making every `isOverlay` branch inside it dead code). The row and the indicator both show the level; they are at different places on screen, so this reinforces rather than clutters.

4. **An indicator line at the landing slot, indented to the landing depth** — a 3px accent line with an end-dot, matching the canvas's Decision 3 visually and in tokens. It renders **in the insertion-strip slot geometry**: the inert spacer that already replaces each strip during a drag becomes the line when it is the landing slot. One geometry, two states — the strip and the indicator can never disagree about where a gap is, every position is reachable including above the first row, and the slot's height is already reserved so nothing shifts when the line appears.

5. **Shown whenever a landing resolves; hidden on an exact no-op.** A landing identical to the row's current slot *and* depth draws nothing, so the indicator never promises a change that would not happen — consistent with the existing rule that a settled drag writes nothing. In-place re-indent is therefore the case where the indicator is the *only* signal, which is what makes it worth having.

6. **A `/renderer`-local component**, visually matched to the canvas's rather than shared with it. The canvas's `DropIndicatorLine` takes `variant: "above" | "below" | "flow"` — boundary dialect describing absolutely-positioned strips — which does not describe the tree's in-flow 4px slot. More decisively, there are no `renderer → editor` imports today, and a Consumer importing only `/renderer` should not pull the editor in.

## Architecture

The indicator derives from `pending`, the resolved drop the tree already holds, which comes from `projectDropDepth` — clamped by the neighbours, by the `max_depth` ceiling, and by the height of the branch being dragged. **The indicator therefore cannot draw an illegal landing**, and no new rule is needed to make that true: it renders the same resolution the release reads, which is the single-source-of-truth pattern the canvas's Decision 3 also relies on.

Adoption marking is untouched. The outline on each adopted row and the `role="status"` count answer "and these come too"; the indicator answers "where, and at what level". The two are complementary and share no state beyond `pending`.

## Testing

Depth arithmetic is asserted at the pure-function seam, as it already is — nothing here changes `projectDropDepth`. What is new is assertable through the rendered output:

- the indicator appears at the resolved slot, at the resolved depth, driven through the keyboard sensor as the tree's other drag tests are;
- it is absent for an exact no-op;
- it is present for an in-place re-indent, where nothing else moves;
- the dragged row carries no horizontal translation;
- release produces the arrangement the indicator showed — the same single-source pin the canvas uses, deriving both from one resolution.

## Non-goals

- **A `DragOverlay` for the tree.** Considered and rejected: it comes with the canvas's Decision 2 (a still list) or it double-renders the row, and the parting list is being kept.
- **Sharing one indicator component between canvas and tree.** Rejected on layering, and because generalising a correct, heavily-tested canvas component to fit a different geometry is churn in working code.
- **Changing any drop rule.** No bound, floor, ceiling or adoption semantic moves. This is a rendering change.
