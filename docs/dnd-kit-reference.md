# dnd-kit Reference for Fieldkit

This document describes how fieldkit uses `@dnd-kit/core` (v6.3) and `@dnd-kit/sortable` (v8.0) for drag-and-drop field reordering in the spec editor. Read this before modifying `SpecEditor` or adding drag-and-drop elsewhere.

## Scope

dnd-kit is used in **one file only**: `src/editor/spec-editor.tsx`. No other layer (renderer, table, rich-text-spec, schema) uses dnd-kit. The `EditorSpecEditor` uses toggle checkboxes, not drag-and-drop.

## Architecture

Two components:

- **`SpecEditorInner`** (exported as `SpecEditor`) — Owns sensors, `DndContext`, `SortableContext`, and the `onDragEnd` handler
- **`SortableFieldItem`** — Per-row component, calls `useSortable`, renders the drag handle. Not exported.

State is **fully controlled** — fieldkit holds no internal schema state. `onChange` must update the parent's copy of `schema`.

## Imports Used

### From `@dnd-kit/core`

| Import | Purpose |
|---|---|
| `DndContext` | Outermost drag-and-drop boundary |
| `closestCenter` | Collision detection strategy |
| `DragEndEvent` | Type for `onDragEnd` event |
| `PointerSensor` | Mouse/touch input handling |
| `KeyboardSensor` | Keyboard accessibility |
| `useSensor` | Instantiates a sensor |
| `useSensors` | Combines sensors for `DndContext` |

### From `@dnd-kit/sortable`

| Import | Purpose |
|---|---|
| `SortableContext` | Sort-aware context for child items |
| `useSortable` | Per-item hook for drag state |
| `verticalListSortingStrategy` | Optimized vertical list algorithm |
| `sortableKeyboardCoordinates` | Maps arrow keys to sortable positions |
| `arrayMove` | Immutable array reorder utility |

### From `@dnd-kit/utilities`

| Import | Purpose |
|---|---|
| `CSS` | `CSS.Transform.toString(transform)` for CSS transform strings |

## Sensor Configuration

```ts
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },  // 8px dead zone to distinguish click from drag
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,  // arrow keys for a11y
  }),
);
```

The 8px distance constraint prevents accidental drags when clicking edit/remove buttons.

## DndContext Setup

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleDragEnd}
>
  <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
    {schema.map((field) => <SortableFieldItem ... />)}
  </SortableContext>
</DndContext>
```

- `items` = `schema.map(f => f.config.api_accessor)` — `api_accessor` strings as unique IDs
- `closestCenter` — finds the droppable whose center is closest to the dragged item's center
- Only `onDragEnd` is handled. No `onDragStart`, `onDragOver`, `onDragMove`, or `onDragCancel`.

## useSortable in SortableFieldItem

```ts
const {
  attributes,     // role, aria-*, tabIndex → spread on drag handle
  listeners,      // onPointerDown → spread on drag handle
  setNodeRef,     // → set on outer <div> (measurement surface)
  transform,      // current drag offset
  transition,     // snap-back animation
  isDragging,     // true while being dragged
} = useSortable({ id: field.config.api_accessor });
```

**Separation of concerns:**
- `setNodeRef` goes on the **row container** (droppable measurement surface)
- `attributes` + `listeners` go on the **drag handle button** (activation target)

## onDragEnd Handler

```ts
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = fieldIds.indexOf(active.id as string);
  const newIndex = fieldIds.indexOf(over.id as string);

  if (oldIndex !== -1 && newIndex !== -1) {
    onChange(arrayMove([...schema], oldIndex, newIndex));
  }
};
```

## Drag Handle

```tsx
<button
  type="button"
  aria-label="Drag to reorder"
  {...attributes}
  {...listeners}
  style={{ cursor: "grab", border: "none", background: "none", ... }}
>
  <GripVertical size={16} />  {/* lucide-react */}
</button>
```

## Style Pattern During Drag

```ts
const style: React.CSSProperties = {
  transform: CSS.Transform.toString(transform),
  transition,
  background: isDragging ? "#f0f4ff" : "#fff",
  opacity: isDragging ? 0.8 : 1,
  // ... layout styles
};
```

## Data Flow

```
schema (Field[])
  → fieldIds = schema.map(f => f.config.api_accessor)
  → SortableContext items={fieldIds}
  → SortableFieldItem useSortable({ id: api_accessor })

User drags:
  PointerSensor activates (after 8px)
  → DndContext fires onDragEnd
  → arrayMove(schema, oldIndex, newIndex)
  → onChange(reorderedSchema)
```

## What Is NOT Used

| Feature | Why |
|---|---|
| `DragOverlay` | No ghost element; the item itself moves |
| `onDragStart` / `onDragOver` / `onDragCancel` | No intermediate state needed |
| `MouseSensor` / `TouchSensor` | `PointerSensor` covers both |
| `modifiers` | No axis restriction or boundary clamping |
| `setActivatorNodeRef` | Not applied to handle (minor a11y gap) |
| Multiple `SortableContext` | Single list per editor |
| `disabled` prop | All fields are always draggable |

## When Adding New Drag-and-Drop

If adding dnd-kit usage elsewhere in fieldkit, follow this same pattern:
1. Use `PointerSensor` with `{ distance: 8 }` + `KeyboardSensor` with `sortableKeyboardCoordinates`
2. Use `closestCenter` collision detection for vertical lists
3. Use `verticalListSortingStrategy` for vertical layouts
4. Keep state fully controlled (lift to consumer via `onChange`)
5. Separate `setNodeRef` (on container) from `listeners`/`attributes` (on drag handle)
6. Use `CSS.Transform.toString()` for transform styles
7. Use Lucide's `GripVertical` icon for drag handles
