# dnd-kit Reference for Fieldkit

How fieldkit uses `@dnd-kit/core` (6.3.1) and `@dnd-kit/sortable` (8.0.0)
for drag-and-drop — in the spec editor, and in the renderer's Reference Tree.
Read this before modifying either. Fieldkit stays on `@dnd-kit/core` +
`@dnd-kit/sortable` throughout, and does **not** take the pre-1.0
`@dnd-kit/react` that knkCMS core uses: one drag library across the package,
and no 0.x peer dependency in a shared library.
Rewritten for the 0.11.0 drag-feedback rework (overlay preview,
still list, `resolveDropTarget`) — design record:
`docs/superpowers/specs/2026-07-14-drag-feedback-design.md`. Extended for
the 0.12.0 spring-loaded sections feature (dwell-triggered tab switching,
explicit droppable re-measuring — see [Measuring](#measuring) below) —
design record: `docs/superpowers/specs/2026-07-14-spring-loaded-sections-design.md`.
Extended again for the Reference Tree's drag feedback, its mid-drag folding
(a dragged branch folds away; a folded one springs open on a dwell) and its
still list (no row displaces; the dragged row is lifted and follows the pointer
with no overlay) — design record:
`docs/superpowers/specs/2026-08-05-tree-drag-feedback-design.md`.

## Scope

Two layers drag. The **editor layer** moves fields around a canvas:

| File | Role |
|---|---|
| `src/editor/editor-canvas.tsx` | `DndContext` (×2: sectionless + sectioned), sensors, both `SortableContext`s, all drag handlers, the portaled `DragOverlay`, live feedback state |
| `src/editor/field-shell.tsx` | `useSortable` per field shell; the persistent grip carries `attributes`/`listeners` |
| `src/editor/card-frame.tsx` | `useSortable` per card marker; the header grip block-moves the card |
| `src/editor/visible-collision.ts` | `editorCollision` — `pointerWithin` for tab-trigger zones, else `visibleClosestCenter` (`closestCenter` filtered to visible non-zero-rect droppables) |
| `src/editor/resolve-drop-target.ts` | Pure drop resolution shared by `handleDragEnd` and the live indicator/tint/highlight |
| `src/editor/drag-previews.tsx`, `src/editor/drop-indicator.tsx` | Presentational: overlay clones, insertion line |

The **renderer layer** drags inside one field — the Reference Tree, where an
Author reorders and nests the References a Field holds:

| File | Role |
|---|---|
| `src/renderer/fields/reference-tree.tsx` | `DndContext` + one `SortableContext`, sensors, all drag handlers, `useSortable` per row; `resolveDrop` is its single mid-drag/drop resolution; owns the mid-drag folding |
| `src/renderer/fields/use-spring-loaded-branch.ts` | Pointer dwell before a hovered folded Reference springs open |
| `src/schema/reference-tree.ts` | The maths, with no dnd-kit import at all: flatten, project a drop depth, move a branch, re-nest |

Nothing else (table, rich-text-spec) uses dnd-kit. `EditorSpecEditor` uses
toggle checkboxes, not drag-and-drop.

### The Reference Tree's differences from the canvas

A tree is a flat DOM list with padded indentation, and its rows are the same
height — so it takes a shape the canvas cannot: **a no-op strategy with no
`DragOverlay`**, plus plain `closestCenter` (a collapsed row is unmounted, so
there are no hidden-but-mounted droppables to filter out).

#### The no-overlay/no-op pair

The canvas's `noopSortingStrategy` and the tree's `stillListStrategy` are the
same one-liner (`() => null`) leaning on **opposite halves of one expression**,
and getting that backwards is silent, so it is written down here.
`useSortable` (sortable 8.0.0) computes:

```js
const shouldDisplaceDragSource = !useDragOverlay && isDragging;
const dragSourceDisplacement = shouldDisplaceDragSource && displaceItem ? transform : null;
const finalTransform = displaceItem ? (dragSourceDisplacement ?? strategy({…})) : null;
```

`SortableContext` sets `useDragOverlay = Boolean(dragOverlay.rect !== null)`.

- **Canvas** (overlay mounted): `shouldDisplaceDragSource` is false, so the
  ACTIVE node falls through to `strategy(…) → null` as well. Every real node is
  untransformed and the portaled clone carries the movement.
- **Tree** (no overlay): `shouldDisplaceDragSource` is true for the active row,
  so `dragSourceDisplacement` is dnd-kit's raw drag delta and **short-circuits
  the strategy entirely for that row**. Non-active rows still go through it and
  get `null`.

That asymmetry is the whole reason the tree can hold its list still *and* keep
its dragged row following the pointer, without the `DragOverlay` it has
declined twice (tree drag-feedback spec 2026-08-05, Decisions 10–11). A wrong
guess here does not fail loudly — it produces a drag with nothing following the
pointer, which jsdom cannot see, since jsdom lays nothing out and only the
*absence* of a transform is assertable there.

**One caveat sits inside `displaceItem`, and it bites the active row too.**
`displaceItem` is false while `disableTransforms` is, and `SortableContext`
sets that whenever its `items` changed on this render — so for the single commit
after rows mount or unmount mid-drag, *nothing* is transformed, the dragged node
included. That is dnd-kit declining to displace against rects it is replacing,
and it corrects on the next render. It matters here because the tree changes
`items` mid-drag by design (Decisions 7–8), so any test that means to pin "the
dragged row follows the pointer" has to drive a drag *through* a fold or a
spring and read the translate afterwards — a list of childless roots never
changes `items` and cannot see it.

Both `useSortable` calls also pass `animateLayoutChanges: () => false`. Without
it, `useDerivedTransform` re-transforms any row whose index changed from the
rect it used to occupy — which in the tree fires on the mid-drag fold and every
spring (Decisions 7–8), putting displacement back on rows by a second route.

**The tree serialises the active row's transform vertically only.** That raw
delta arrives on BOTH axes, and the tree separately sets that row's `ml` to the
depth a release would land at — so applying the transform unmodified put a
continuous sideways travel on top of a quantised 24px indent, and the quantised
part is the answer to "what level will this land at".
`CSS.Translate.toString(transform && { ...transform, x: 0 })` is what leaves the
indent saying it alone (tree drag-feedback spec 2026-08-05, Decision 1). This is
appearance only: the depth projection reads `event.delta.x` off the drag event,
which is untouched, so ←/→ still change the drop depth. Non-active rows are
unaffected — they carry no transform at all.

**The landing is drawn in the insertion strip's slot.** `resolveDrop` also
answers `landsBefore` (from `referenceDropTarget` in `/schema`, which reads the
same `dropSlot` rule `moveReferenceBranch` splices at), and the gap it names
renders `ReferenceDropIndicator` instead of `ReferenceInsertSpacer` — same
height, so nothing shifts. It is a `/renderer`-local copy of the canvas's
`DropIndicatorLine`, not a share: `/renderer` imports nothing from `/editor`,
and the canvas's `variant: "above" | "below" | "flow"` is dialect for
absolutely-positioned strips. A landing that would rewrite nothing draws
nothing, off the same predicate `handleDragEnd` uses to skip the write.

**A tree drag changes what is folded, which changes what is mounted.** Lifting
a Reference folds its own branch away for the duration and restores it on the
drop or the cancel; resting a *pointer* drag on a folded Reference springs it
open after `SPRING_DWELL_MS`, and a spring that did not receive the drop folds
back (tree drag-feedback spec 2026-08-05, Decisions 7–9). So rows unmount at
drag start and mount mid-drag — see [Measuring](#measuring) for what that does
to rects, and why the tree names its strategy rather than inheriting it. The
tree's mid-drag resolution is **derived** from the last drag event rather than
stored beside it, for the same reason: a spring reshapes the visible list
without any dnd-kit event firing, and a resolution captured at the last pointer
move would go on naming a gap that has moved.

The dwell lives in `src/renderer/fields/use-spring-loaded-branch.ts` — the
editor's `useSpringLoadedTab` in tree terms, copied rather than shared because
`/renderer` imports nothing from `/editor`. **`SPRING_DWELL_MS` is restated
with the same value in both, deliberately: one gesture, one feel. They move
together or not at all.**

Its resolver reads **two lists**, and that split is load-bearing. Order comes
from every row, folded ones included, because a branch travels with its
Reference whether or not it is on screen; depth comes from the *visible* rows
alone, so a drop can only reach a depth whose neighbours an Author can see —
projecting against the full list lets a drag nest inside a folded branch,
which was a real bug. A drop that lands inside a folded Reference unfolds it.

Its other addition is a coordinate getter: `sortableKeyboardCoordinates` reads
ArrowLeft/ArrowRight as "find a droppable that way", which in a single column
finds nothing, so the tree intercepts those two codes and offsets `x` by one
indent instead. That is what puts *nesting* — not just reordering — within
reach of the keyboard, and it is how the drag tests drive depth changes:
`x` accumulates into `event.delta.x`, which is the offset the depth
projection reads. Without a `DragOverlay` there is also no overlay rect for a
jsdom test to pin (see the keyboard-collision note under Verified engine
facts); the dragged node's own mocked rect is what dnd-kit measures.

## The 0.11.0 drag model (read this first)

Each tab is ONE flat sortable list — card markers AND fields — regardless
of how the DOM nests fields inside card frames. During a drag:

1. **The real nodes never move.** Both `SortableContext`s use a no-op
   strategy (`noopSortingStrategy = () => null`), so `useSortable` hands
   every item a `null` transform. With a mounted `DragOverlay`, dnd-kit
   also stops displacing the drag source (`shouldDisplaceDragSource ===
   false` once `dragOverlay.rect` measures), so the ACTIVE node stays
   untransformed too. This killed the two measured 0.10 artifacts: the
   scale artifact (the list strategy scaled the dragged node to the
   hovered slot's size — `scaleY 0.33–3.5` measured) and frame escape
   (flat-strategy translations moved a frame −301px while its child moved
   −151px).
2. **A `DragOverlay` clone follows the pointer** — portaled to
   `document.body` by fieldkit (dnd-kit does NOT portal it; it renders a
   `position: fixed` wrapper in place, which a transformed host ancestor
   would re-anchor). Field drags clone the shell interior
   (`ShellDragPreview`); card drags clone the header bar + a "+ N fields"
   hint (`CardDragPreview`, wrapper collapsed via `style={{height:
   "auto"}}`). The clone root carries
   `data-testid="drag-overlay-preview"`. The origin dims in place
   (`data-drag-origin`, opacity 0.35, dashed border).
3. **Feedback = `resolveDropTarget`.** `onDragOver` stores the resolved
   target; the insertion line (`drop-indicator` + `data-position`), the
   receiving card's `primary.subtle` tint, and the tab-trigger highlight
   (`data-drop-target`) render from it — and `handleDragEnd` resolves the
   SAME function at release. One source of truth; they cannot disagree.
4. **No settle transforms**: both `useSortable` calls pass
   `animateLayoutChanges: () => false` (the default re-transforms a moved
   node from its old rect, including a transient scale whenever its width
   changes); the overlay's default drop animation is the only settle.

## Measuring

**Ground truth: a droppable that stays mounted measures its rect at drag start
only** (the `WhileDragging` default measuring strategy re-measures on
scroll/resize, not on an arbitrary DOM visibility flip). A droppable that is
`hidden` when a drag begins keeps whatever zero-size rect it measured while
hidden for the rest of that drag — dnd-kit has no hook that says "this
container just became visible, re-measure it."

**Mounting and unmounting are a different case, and it re-measures itself.**
Checked against the installed 6.3.1/8.0.0 sources for the Reference Tree's
mid-drag folding:

- Registering or unregistering a droppable replaces
  `state.droppable.containers` with a **new `DroppableContainersMap`**
  (`reducer`, `core.esm.js`), so `enabledDroppableContainers` gets a new
  identity, so `useDroppableMeasuring`'s `droppableRects` lazy memo recomputes
  — and since its guard is `containersRef.current !== containers`, it
  re-measures **every** container, not only the one that changed. Rows that
  merely *moved* because a sibling unmounted are therefore re-measured too.
- `SortableContext` asks for the same thing independently: a layout effect
  fires `measureDroppableContainers(items)` whenever `itemsHaveChanged &&
  isDragging`, and blanks the strategy (`disableTransforms`) for that render so
  nothing is displaced against the rects it is replacing.
- The **active** node keeps up as well. `useRect` observes `document.body` with
  a `MutationObserver` (`childList`, `subtree`) and re-measures whenever a
  mutation contains the dragged element; `nodeRectDelta` then subtracts that
  movement from the translate, so the collision rect stays anchored under the
  pointer when rows mount *above* the drag. Measured in the tree's spring test:
  the pointer that had been over a folded parent is over its newly revealed
  child once the branch opens, which is what the Author sees.

None of that is a reason to leave the strategy implicit. The Reference Tree
names it — `measuring={{droppable: {strategy: MeasuringStrategy.WhileDragging}}}`,
hoisted to a module constant so it is not a fresh object identity every render
— because it now changes shape *during* a drag by design (Decisions 7 and 8
below). `WhileDragging` **is** the default; writing it down is the point, since
what was a default nobody thought about is now a dependency. `Always` was tried
and behaves identically here, differing only in that it measures between drags
too — cost with no answer attached, so the spring spec's rule applies:
correctness first, then the cheapest strategy that re-measures on the swap.

**What this does not do is make the tests see a stale rect.** jsdom lays nothing
out, so `getBoundingClientRect` is 0×0 unless a test fakes it, and removing the
`measuring` prop breaks nothing — the two mechanisms above already cover the
tree's case. The tests that would catch a genuine regression are the ones that
drive a drag *through* a shape change and pin where it lands afterwards (see
`reference-tree-folds.test.tsx`, "leaves a sprung branch open when the drop
lands inside it": the row the drop resolves against did not exist when the drag
began).

Spring-loaded sections (0.12.0) breaks this assumption on purpose: springing
to a foreign tab mid-drag makes its panel (and every shell/card-frame inside
it) visible for the first time *during* the same drag that needs to collide
with them. Left alone, the just-sprung tab is drop-dead — `onDragOver` never
resolves an `over` inside it, so no line, no tint, no drop.

`DragRemeasurer` (a presentation-less component rendered *inside*
`DndContext`, `src/editor/editor-canvas.tsx`) is the fix: on every
`activeTabIndex` change while a drag is active, it calls
`useDndContext().measureDroppableContainers(ids)` with every currently
registered droppable id. The call has to be timed carefully — the sprung
tab's `Tabs.Content` panel unhides asynchronously (zag flips its `hidden`
attribute up to ~47 ms after the React commit that changed
`activeTabIndex`, an idiom this codebase has hit before — see the
retry-until-unhidden note on `scrollShellIntoView` in the same file, and the
0.10.0 lesson it references). Measuring one tick too early re-captures the
same zero rects. `DragRemeasurer` therefore polls the sprung panel's
`[role="tabpanel"]` via `requestAnimationFrame`, checking `!hasAttribute
("hidden")`, and only calls `measureDroppableContainers` once that's true (or
after 20 attempts, so a stuck panel can't loop forever) — the same
retry-until-unhidden idiom, applied to measuring instead of scrolling.

## Imports used

### From `@dnd-kit/core`

| Import | Purpose |
|---|---|
| `DndContext` | Outermost boundary |
| `DragOverlay` | The drag clone (fieldkit portals it to `document.body`) |
| `closestCenter` | Base collision strategy (wrapped by `visibleClosestCenter`) |
| `PointerSensor` / `KeyboardSensor` + `useSensor`/`useSensors` | Input |
| `useDroppable` | Tab-trigger drop zones (`tabdrop-N`) |
| `DragStartEvent` / `DragOverEvent` / `DragEndEvent` (types) | Handlers |

### From `@dnd-kit/sortable`

| Import | Purpose |
|---|---|
| `SortableContext` | One per tab's flat list |
| `SortingStrategy` (type) | Types the no-op strategy |
| `useSortable` | Shells + card frames |
| `sortableKeyboardCoordinates` | Arrow-key coordinate getter |

### From `@dnd-kit/utilities`

| Import | Purpose |
|---|---|
| `CSS` | `CSS.Translate.toString(transform)` — translate-only serialization (belt: scale components can never reach a real node again) |

## Sensors and DndContext

Unchanged since 0.8: `PointerSensor` with `activationConstraint:
{ distance: 8 }` (click vs drag dead zone) + `KeyboardSensor` with
`sortableKeyboardCoordinates`. `collisionDetection={editorCollision}`
(0.11.2): tab-trigger zones resolve by `pointerWithin` — closestCenter
compares the DRAGGED RECT's center to droppable centers, and the
canvas-wide row's center sits too far from a small trigger chip for a tab
zone ever to win by distance (measured: pointer drags could not reach tabs
at all; keyboard drags worked because the coordinate getter moves the rect
onto each zone). Everything else falls back to `visibleClosestCenter`
(hidden tabs stay mounted, so zero-rect droppables must be filtered). ALL
FIVE handlers are wired: `onDragStart` (drag flag + overlay id),
`onDragOver` (unconditional tabdrop hover-activation + live target),
`onDragEnd` (resolve + apply), `onDragCancel` (reset).

## Verified engine facts (checked against the installed sources)

- `SortableContext` detects an overlay via `dragOverlay.rect !== null`,
  set once the overlay node mounts and measures. Whether it is set decides
  whether a no-op strategy reaches the ACTIVE node at all — see [The
  no-overlay/no-op pair](#the-no-overlayno-op-pair), which is why the canvas and
  the tree get opposite behaviour out of the same `() => null`.
- **Keyboard collision rect:** once the overlay measures, dnd-kit derives
  `collisionRect` from `dragOverlay.rect ?? activeNodeRect`, and
  `sortableKeyboardCoordinates` direction-filters candidates against it.
  **Any jsdom test that fakes `getBoundingClientRect` for keyboard walks
  MUST give `[data-testid="drag-overlay-preview"]` the dragged item's
  initial rect** — see the mocks in `dnd.test.tsx`,
  `cards-canvas.test.tsx`, and `drag-feedback.test.tsx`.
- The overlay wrapper measures its single CHILD (`getMeasurableNode`), so
  the preview root's testid is the measured element. The testid must never
  start with `shell-` or `card-frame-` (document-level mocks and order
  queries key on those prefixes).
- Keyboard drags position the overlay with a built-in `transform 250ms
  ease` transition (pointer drags: none) — keyboard parity costs no code.
- **`onDragMove` carries a stale `over`.** dnd-kit dispatches it from an
  effect keyed on the translation and `onDragOver` from one keyed on
  `overId`, declared in that order, and `setOver` happens inside the second
  — so a step that changes both reaches `onDragMove` with the row the drag
  was over *before* it. **Live feedback must be wired to both handlers**;
  they fire in the same flush, so the fresher answer lands. The Reference
  Tree binds one function to the pair for exactly this reason. `onDragEnd`
  is unaffected.
- **Pointer drags ARE drivable in jsdom, with four lines.** The only thing
  missing is the `PointerEvent` constructor: `PointerSensor`'s activator reads
  `isPrimary` and `button` off the native event, and `getEventCoordinates`
  reads `clientX`/`clientY` — all of which a `class extends MouseEvent` with an
  `isPrimary` field carries. Define it, and `fireEvent.pointerDown(grip, …)` +
  `fireEvent.pointerMove(document, …)` drive a real drag (the sensor listens on
  the owner *document*, not the grip). **Three files define it** —
  `src/renderer/fields/__tests__/reference-tree-folds.test.tsx` (the tree's
  dwell), `src/editor/__tests__/spring-loaded-tabs.test.tsx` (the canvas's), and
  `src/editor/__tests__/grip-click-vs-drag.test.tsx` (the 8px dead zone between
  a click on a grip and a drag from it). They
  are deliberate copies, not a share: `PointerEvent` is a **global**, and
  anker's zag-based components branch on whether it exists, so it stays in the
  files that need it and out of `src/test/setup.ts`. A fourth pointer-driving
  file copies the shim again rather than promoting it.
  Two gotchas: the move that *satisfies* the 8px
  distance constraint calls `handleStart()` and returns without reporting
  coordinates, so a drag needs one move to activate and another to travel; and
  a sensor keeps a **capture-phase `click` blocker on `document`** until 50ms
  after it detaches, so a test that ends with a drag still in flight will
  silently swallow the *next* test's clicks. End every drag.
- The default drop animation reads `getComputedStyle(node).transform` and
  `parseTransform` only accepts `matrix()`/`matrix3d()` — jsdom never
  produces those, so it early-returns before `node.animate` (which jsdom
  lacks). The default `dropAnimation` is therefore test-safe; the post-drop
  clone unmount is async (assert absence with `waitFor`).

## When adding new drag-and-drop

1. `PointerSensor` `{ distance: 8 }` + `KeyboardSensor` with
   `sortableKeyboardCoordinates`.
2. `visibleClosestCenter` when hidden-but-mounted droppables exist;
   plain `closestCenter` otherwise. If small discrete drop targets coexist
   with full-width sortables, give the small targets first claim via
   `pointerWithin` (see `editorCollision`) — center distance alone cannot
   reach them.
3. For heterogeneous-height lists (or any nested-DOM rendering of a flat
   list): `DragOverlay` clone + no-op strategy. For a homogeneous flat list:
   a no-op strategy **without** an overlay, which holds the list still and
   still lets the dragged node follow the pointer — see [The no-overlay/no-op
   pair](#the-no-overlayno-op-pair). `verticalListSortingStrategy` is a reflow
   preview and nothing else: reach for it only when a parting list is wanted,
   and not at all alongside anything else that reshapes the list mid-drag
   (a spring, a fold), or one gesture moves the list twice.
4. Keep state fully controlled; separate `setNodeRef` (container) from
   `listeners`/`attributes` (grip button). Lucide `GripVertical` for handles.
5. `CSS.Translate.toString()` for transform styles.
6. Route the live feedback AND the drop through one pure resolver function.
7. If drop targets **appear or unhide** mid-drag without mounting — a panel
   whose `hidden` attribute flips, say — re-measure them explicitly; dnd-kit
   will not do this for you (`DragRemeasurer`). If they **mount or unmount**
   mid-drag, it already does: register/unregister forces a full re-measure, and
   `SortableContext` asks again when its `items` change. Either way, name the
   `measuring` strategy rather than inheriting it, so the dependency is visible
   at the boundary that has it. See [Measuring](#measuring) above for both.

## What is NOT used

| Feature | Why |
|---|---|
| `modifiers` | No axis restriction or boundary clamping |
| `adjustScale` | Off (default) — the clone never scales |
| `MouseSensor` / `TouchSensor` | `PointerSensor` covers both |
| `arrayMove` | Drops splice via draft-ops (`moveField`/`moveCard`/`moveFieldToSection`), or, in the tree, via `moveReferenceBranch` — which moves a whole branch, not one item |
| Multiple nested `SortableContext`s | Cards stay in the tab's ONE flat list |
