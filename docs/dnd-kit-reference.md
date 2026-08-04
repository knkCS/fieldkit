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
| `src/renderer/fields/reference-tree.tsx` | `DndContext` + one `SortableContext`, sensors, all drag handlers, `useSortable` per row; `resolveDrop` is its single mid-drag/drop resolution |
| `src/schema/reference-tree.ts` | The maths, with no dnd-kit import at all: flatten, project a drop depth, move a branch, re-nest |

Nothing else (table, rich-text-spec) uses dnd-kit. `EditorSpecEditor` uses
toggle checkboxes, not drag-and-drop.

### The Reference Tree's differences from the canvas

A tree is a flat DOM list with padded indentation, and its rows are the same
height — so it takes the simpler shape rule 3 below allows: no `DragOverlay`,
`verticalListSortingStrategy` for the reflow preview, and plain
`closestCenter` (a collapsed row is unmounted, so there are no
hidden-but-mounted droppables to filter out).

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

**Ground truth: droppables measure their rect at drag start only** (the
`WhileDragging` default measuring strategy re-measures on scroll/resize, not
on an arbitrary DOM visibility flip). A droppable that is `hidden` when a
drag begins keeps whatever zero-size rect it measured while hidden for the
rest of that drag — dnd-kit has no hook that says "this container just
became visible, re-measure it."

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
  set once the overlay node mounts and measures.
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
   list): `DragOverlay` clone + no-op strategy. `verticalListSortingStrategy`
   only fits homogeneous flat lists where a reflow preview is wanted.
4. Keep state fully controlled; separate `setNodeRef` (container) from
   `listeners`/`attributes` (grip button). Lucide `GripVertical` for handles.
5. `CSS.Translate.toString()` for transform styles.
6. Route the live feedback AND the drop through one pure resolver function.
7. If drop targets appear/unhide mid-drag, re-measure them explicitly — see
   [Measuring](#measuring) above; dnd-kit will not do this for you.

## What is NOT used

| Feature | Why |
|---|---|
| `modifiers` | No axis restriction or boundary clamping |
| `adjustScale` | Off (default) — the clone never scales |
| `MouseSensor` / `TouchSensor` | `PointerSensor` covers both |
| `arrayMove` | Drops splice via draft-ops (`moveField`/`moveCard`/`moveFieldToSection`), or, in the tree, via `moveReferenceBranch` — which moves a whole branch, not one item |
| Multiple nested `SortableContext`s | Cards stay in the tab's ONE flat list |
