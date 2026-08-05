# Reference Tree Drag Feedback — Design

**Date:** 2026-08-05
**Status:** Approved (root-caused from a report that the drop level is unreadable; scope and treatment settled in a grilling session)
**Amended:** 2026-08-05, Decisions 7–9 — what the *tree* shows during a drag, after a second report that a dragged expanded branch is confusing to aim past. Decisions 1–6 shipped as #114.
**Amended again:** 2026-08-05, Decisions 10–12 — **which reverse Decision 2.** Decisions 7–9 shipped as #119.
**Ships as:** a Reference Tree feedback change; zero API delta

Sibling to [the editor canvas's drag-feedback rework](./2026-07-14-drag-feedback-design.md), whose Decisions 1–3 this borrows from selectively rather than wholesale. Where the two differ, the difference is deliberate and stated below.

## Motivation (root cause)

**The tree already draws the landing depth, and then buries it.**

During a drag the dragged row's horizontal position is the sum of two things:

1. `CSS.Translate.toString(transform)` — for the *active* item, dnd-kit's `useSortable` returns the raw drag delta, **both axes**, and the tree applies it unmodified;
2. `ml: projectedDepth × INDENT_WIDTH` — the depth the release would actually land at, quantised in **24px** steps (`INDENT_WIDTH`; knkCMS core's equivalent is 32, which is a separate number and not this one).

So a continuous pointer travel of any size rides on top of a 24px quantised nudge. The signal that answers "what level will this land at" is present in the DOM on every frame, and is swamped by the signal that answers "where is the mouse". The editor canvas does not have this problem because it kills transforms outright (`noopSortingStrategy`) and lets an overlay carry the movement.

Two secondary gaps follow from the same place:

- **Nothing marks the landing slot.** The parting list implies it, but the tree has no equivalent of the canvas's indicator line.
- **In-place re-indent is invisible.** The tree permits changing a Reference's depth without moving it — the one interaction knkCMS core cannot do at all — and today the only evidence is a one-level margin shift on a half-opacity row.

## Decisions (locked)

1. **Suppress horizontal translation on the dragged row.** Its `transform` carries the vertical component only, so its indent reflects the projected depth and nothing else. This changes appearance only: the projection's input is `event.delta.x`, read from the drag event, and is untouched — ←/→ keep changing depth exactly as before, and become *more* legible, not less.

2. **Keep the list parting.** `verticalListSortingStrategy` stays; rows continue to displace to show where the drop lands. This is the deliberate divergence from the canvas's Decision 2 — the canvas needed a still list because flat-strategy translations escaped its nested card frames, a problem the tree's flat DOM does not have. The tree's parting list is a feature, and the indicator supplements it rather than replacing it.

3. **The dragged row stays visible, dimmed, and indented to the projected depth.** Unlike knkCMS core, which collapses the dragged row into a bar and so gives an Author no way to tell which Reference is in flight (its `DragOverlay` is mounted but renders nothing — `RelatedItem` opens `return (!isOverlay && (…))`, making every `isOverlay` branch inside it dead code). The row and the indicator both show the level; they are at different places on screen, so this reinforces rather than clutters.

4. **An indicator line at the landing slot, indented to the landing depth** — a 3px accent line with an end-dot, matching the canvas's Decision 3 visually and in tokens. It renders **in the insertion-strip slot geometry**: the inert spacer that already replaces each strip during a drag becomes the line when it is the landing slot. One geometry, two states — the strip and the indicator can never disagree about where a gap is, every position is reachable including above the first row, and the slot's height is already reserved so nothing shifts when the line appears.

5. **Shown whenever a landing resolves; hidden on an exact no-op.** A landing identical to the row's current slot *and* depth draws nothing, so the indicator never promises a change that would not happen — consistent with the existing rule that a settled drag writes nothing. In-place re-indent is therefore the case where the indicator is the *only* signal, which is what makes it worth having.

6. **A `/renderer`-local component**, visually matched to the canvas's rather than shared with it. The canvas's `DropIndicatorLine` takes `variant: "above" | "below" | "flow"` — boundary dialect describing absolutely-positioned strips — which does not describe the tree's in-flow 4px slot. More decisively, there are no `renderer → editor` imports today, and a Consumer importing only `/renderer` should not pull the editor in.

## Decisions 7–9 (amendment, same day)

A second report: dragging an *expanded* parent leaves its descendants on screen as rows you cannot aim at, and the tree gives no sign of it.

**The report's premise — that this breaks the tree — is false, and worth recording as false.** A drop inside your own branch has been impossible since #65: `projectDropDepth` excises the dragged branch from the neighbour list before reading it, and `dropSlot` maps any hover inside the branch back to the branch's own slot. `reference-tree.test.ts`'s *"never offers a Reference a place inside its own branch"* pins it — hovering your own child yields `{depth: 0, minDepth: 0, maxDepth: 0}`. The rules are correct and silent, which is the same shape of problem as Decisions 1–6: the tree knew the answer and did not say it.

7. **The dragged Reference's branch collapses on lift, and is restored on drop or cancel.** Only that branch; no other fold state is touched. Its descendants leave the list for the duration, so every remaining row is a legal target. This is what the tree already believes — *a folded Reference stands in for its whole branch* — applied to the one branch that provably cannot be aimed into.

   It is safe against the depth cap for a reason worth stating: `height` is measured by `flattenReferences` from the **tree**, not from what is on screen, so folding cannot loosen `max_depth`. knkCMS core has precisely this bug — its `relativeSubtreeHeight` reads the visible list, and it collapses every parent by default, making the broken case the normal one ([core comparison](../../core-reference-tree-comparison.md) §5.2).

8. **Dwelling on a collapsed Reference for `SPRING_DWELL_MS` expands it**, reusing the existing constant rather than minting a second. The interaction is the same one the editor already has — rest on a target mid-drag to reveal more of the tree — and one constant means one feel across the package. Keyboard drags have no dwell (the [spring-loaded sections spec](./2026-07-14-spring-loaded-sections-design.md), Decision 6), and need none: a keyboard drop into a folded branch already lands at its end and unfolds it.

9. **A spring is a preview until the drop commits.** Nodes that sprang open and did not receive the drop fold back; the node that received it stays open, which is #65's unfold-on-arrival rule already. Escape restores every fold to what it was at lift, including Decision 7's. This is the spring spec's Decision 4 in tree terms — and it is what keeps a drag that merely wandered past three folded parents from leaving all three open.

## Decisions 10–12 (second amendment) — Decision 2 is reversed

A third report, once springs existed: hovering a collapsed branch to spring it open "moves the item down", and the row under the pointer slides away.

**Diagnosed, and the reported cause was not the cause.** The insertion strips were suspected. They are already inert during a drag — `insertionGap()` branches on `activeKey`, so every slot renders the indicator or an inert spacer, never a strip — and all three share `INSERT_SLOT_HEIGHT`, so swapping between them shifts nothing. The drop indicator cannot shift the list either: its container is fixed at that height and its 8px dot deliberately overflows rather than growing the slot.

What moves is `verticalListSortingStrategy`. The rows displace to open a gap where the dragged row would land, so a drag travelling upward pushes the row under the cursor down by about a row's height, at the same instant the indicator appears.

**Which makes Decision 2 wrong.** It reads:

> **Keep the list parting.** `verticalListSortingStrategy` stays… the canvas needed a still list because flat-strategy translations escaped its nested card frames, a problem the tree's flat DOM does not have. The tree's parting list is a feature.

That was right about *why the canvas did it* and wrong about *whether the tree needed it*. The frame-escape artefact genuinely does not apply here — but "the list holds still" earns its place for a second reason the canvas never had to state, because the canvas has no springs: **a list that both parts and springs moves twice for one gesture, and the row you are aiming at is the one that moves.** Decision 2 is superseded by Decision 10; the rest of the original six stand.

10. **Rows stop parting.** No displacement transforms on non-active rows. The indicator alone says where the drop lands; the dragged row alone says at what level. This is the canvas's Decision 2 adopted, three weeks after being declined on reasoning that held only until springs shipped.

11. **The dragged row keeps following the pointer, in the list.** No `DragOverlay` — declined twice, and it would mean rendering the row a second time. The consequence, accepted deliberately: with no gap opening beneath it, the dragged row visibly overlaps the rows it passes.

12. **The dragged row is lifted rather than dimmed** — opaque, raised above its neighbours, shadowed, so it reads as a card being carried over the list rather than a ghost blended into it. The 0.5 dim existed to say "this one is moving"; the indicator now says where it is going, so being able to read *what* is in hand matters more. Two translucent rows stacked is the thing to avoid.

## Architecture

The indicator derives from `pending`, the resolved drop the tree already holds, which comes from `projectDropDepth` — clamped by the neighbours, by the `max_depth` ceiling, and by the height of the branch being dragged. **The indicator therefore cannot draw an illegal landing**, and no new rule is needed to make that true: it renders the same resolution the release reads, which is the single-source-of-truth pattern the canvas's Decision 3 also relies on.

Adoption marking is untouched. The outline on each adopted row and the `role="status"` count answer "and these come too"; the indicator answers "where, and at what level". The two are complementary and share no state beyond `pending`.

### Decision 10 rests on a dnd-kit detail that must be read, not assumed

The canvas's `noopSortingStrategy` comment says it leaves every real node untransformed — *"and for the active item too **once the overlay is measured** (`shouldDisplaceDragSource` is false)"*. The tree has no overlay, so that clause may not hold here, and the active row may keep its own translate, which is exactly what Decision 11 needs.

**If it does not, Decision 10 collapses into an overlay** — the thing Decisions 11 and the previous round both declined. So this is verified against the installed `@dnd-kit/sortable` sources before anything is built, the way the stale-`onDragMove` finding, the measuring question and the jsdom pointer-drag finding each were. A wrong guess here does not fail loudly; it produces a drag with nothing following the pointer.

Note also that suppressing displacement may change the *shape* of the transform a row carries, and #114's test *"the dragged row carries no horizontal translation"* reads that string. It must keep discriminating — if it can no longer fail, it needs rewriting rather than relaxing.

### Decisions 7–9 change layout mid-drag, and the tests are blind to it

**This is the sharp edge of the amendment.** Neither the tree nor the canvas sets an explicit `measuring` config, so dnd-kit measures droppables when a drag begins. Decision 7 unmounts rows *at* drag start and Decision 8 mounts them *during* one — so unless measurement is ordered after the collapse, or the strategy is made explicit, `overIndex` resolves against rects describing rows that are no longer there.

The reason this needs saying out loud rather than leaving to whoever builds it: `reference-tree.test.tsx`'s drag tests stub geometry through `mockRowRects()`, which answers with fixed rects regardless of what is actually mounted. **A stale-rect bug would very likely pass the suite.** Anything built here needs an explicit measuring strategy *and* at least one assertion that does not stub.

## Testing

Depth arithmetic is asserted at the pure-function seam, as it already is — nothing here changes `projectDropDepth`. What is new is assertable through the rendered output:

- the indicator appears at the resolved slot, at the resolved depth, driven through the keyboard sensor as the tree's other drag tests are;
- it is absent for an exact no-op;
- it is present for an in-place re-indent, where nothing else moves;
- the dragged row carries no horizontal translation;
- release produces the arrangement the indicator showed — the same single-source pin the canvas uses, deriving both from one resolution.

For Decisions 7–9:

- lifting an expanded parent removes its descendants from the list, and dropping or cancelling puts the fold back exactly as it was;
- no fold but the dragged branch's changes on lift;
- dwelling on a folded Reference expands it after the dwell, and crossing it quickly does not;
- a node sprung open that did not receive the drop is folded again afterwards; the one that received it is open;
- Escape restores every fold to its state at lift;
- **at least one drop assertion that does not stub rects**, since the stub cannot see a layout change and the whole risk of this amendment is geometry going stale.

## Non-goals

- **A `DragOverlay` for the tree.** Considered and rejected: it comes with the canvas's Decision 2 (a still list) or it double-renders the row, and the parting list is being kept.
- **Sharing one indicator component between canvas and tree.** Rejected on layering, and because generalising a correct, heavily-tested canvas component to fit a different geometry is churn in working code.
- **Changing any drop rule.** No bound, floor, ceiling or adoption semantic moves. This is a rendering change.
