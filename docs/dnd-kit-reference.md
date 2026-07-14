# dnd-kit Reference for Fieldkit

How fieldkit uses `@dnd-kit/core` (6.3.1) and `@dnd-kit/sortable` (8.0.0)
for drag-and-drop in the spec editor. Read this before modifying editor
drag code. Rewritten for the 0.11.0 drag-feedback rework (overlay preview,
still list, `resolveDropTarget`) — design record:
`docs/superpowers/specs/2026-07-14-drag-feedback-design.md`.

## Scope

dnd-kit is used only by the **editor layer**:

| File | Role |
|---|---|
| `src/editor/editor-canvas.tsx` | `DndContext` (×2: sectionless + sectioned), sensors, both `SortableContext`s, all drag handlers, the portaled `DragOverlay`, live feedback state |
| `src/editor/field-shell.tsx` | `useSortable` per field shell; the persistent grip carries `attributes`/`listeners` |
| `src/editor/card-frame.tsx` | `useSortable` per card marker; the header grip block-moves the card |
| `src/editor/visible-collision.ts` | `visibleClosestCenter` — `closestCenter` filtered to visible (non-zero-rect) droppables |
| `src/editor/resolve-drop-target.ts` | Pure drop resolution shared by `handleDragEnd` and the live indicator/tint/highlight |
| `src/editor/drag-previews.tsx`, `src/editor/drop-indicator.tsx` | Presentational: overlay clones, insertion line |

No other layer (renderer, table, rich-text-spec, schema) uses dnd-kit.
`EditorSpecEditor` uses toggle checkboxes, not drag-and-drop.

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
`sortableKeyboardCoordinates`; `collisionDetection={visibleClosestCenter}`
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
- The default drop animation reads `getComputedStyle(node).transform` and
  `parseTransform` only accepts `matrix()`/`matrix3d()` — jsdom never
  produces those, so it early-returns before `node.animate` (which jsdom
  lacks). The default `dropAnimation` is therefore test-safe; the post-drop
  clone unmount is async (assert absence with `waitFor`).

## When adding new drag-and-drop

1. `PointerSensor` `{ distance: 8 }` + `KeyboardSensor` with
   `sortableKeyboardCoordinates`.
2. `visibleClosestCenter` when hidden-but-mounted droppables exist;
   plain `closestCenter` otherwise.
3. For heterogeneous-height lists (or any nested-DOM rendering of a flat
   list): `DragOverlay` clone + no-op strategy. `verticalListSortingStrategy`
   only fits homogeneous flat lists where a reflow preview is wanted.
4. Keep state fully controlled; separate `setNodeRef` (container) from
   `listeners`/`attributes` (grip button). Lucide `GripVertical` for handles.
5. `CSS.Translate.toString()` for transform styles.
6. Route the live feedback AND the drop through one pure resolver function.

## What is NOT used

| Feature | Why |
|---|---|
| `modifiers` | No axis restriction or boundary clamping |
| `adjustScale` | Off (default) — the clone never scales |
| `MouseSensor` / `TouchSensor` | `PointerSensor` covers both |
| `arrayMove` | Drops splice via draft-ops (`moveField`/`moveCard`/`moveFieldToSection`) |
| Multiple nested `SortableContext`s | Cards stay in the tab's ONE flat list |
