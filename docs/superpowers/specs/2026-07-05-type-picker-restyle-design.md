# TypePicker Restyle + Label Routing (fixes #29)

**Date:** 2026-07-05
**Status:** Approved design (Approach A of three)
**Ships as:** fieldkit 0.2.2 (non-breaking)

## Problem

`src/editor/type-picker.tsx` is the editor's last off-system surface:
styled entirely with inline CSS (raw `--chakra-colors-*` vars), three
author-facing strings outside `EditorLabels` (search placeholder, search
aria-label, "No matching field types"), category headings rendering raw
`FieldTypeCategory` enum values (`text`, `structural`, …) untranslated
and lowercase, and disabled at-max options with no explanation.

## Decision — 1:1 restyle with two small UX repairs

Layout is unchanged (search → category groups → responsive card grid);
implementation moves to Chakra primitives with anker tokens.

### Restyle

- Root: `Stack gap="3"` (keeps `data-testid="type-picker"`).
- Search: Chakra `InputGroup` + `Input` with the lucide `Search` icon as
  `startElement`. Deliberately NOT anker's `SearchInput` — its 300ms
  debounce would change filter timing and test behavior. Controlled
  value, non-debounced, exactly as today.
- Category heading: `Text` with `fontSize="xs" fontWeight="semibold"
  textTransform="uppercase" letterSpacing="wider" color="fg.muted"`.
- Option cards: `Box as="button"` — `borderWidth="1px"
  borderColor="border" borderRadius="md" bg="bg-surface"`, disabled
  state via `bg="bg-subtle"` + reduced opacity, NEW `_hover={{ bg:
  "bg-muted" }}` and `_focusVisible` ring (today there is no hover or
  focus feedback at all).
- Grid: Chakra `Grid templateColumns="repeat(auto-fill, minmax(180px,
  1fr))" gap="2"`.
- Empty state: `Text color="fg.subtle" textAlign="center" p="4"`.
- Every `style={{…}}` in the file is deleted.

### Labels

```ts
export interface TypePickerLabels {
	searchPlaceholder?: string;  // "Search field types..."
	searchLabel?: string;        // aria-label, "Search field types"
	noMatches?: string;          // "No matching field types"
	maxReached?: string;         // "Limit reached (max {max})" — tooltip +
	                             // title on disabled at-max cards
	categories?: Partial<Record<FieldTypeCategory, string>>;
}
```

- `TypePickerProps` gains optional `labels?: TypePickerLabels`;
  `DEFAULT_TYPE_PICKER_LABELS: Required<…>` exported beside it with
  Title-case English category names (Text, Number, Date, Selection,
  Boolean, Structural, Reference, Media). Public API stays
  backward-compatible (labels optional, defaults merged).
- `EditorLabels` gains `typeSearchPlaceholder`, `typeSearchLabel`,
  `typeNoMatches`, `typeMaxReached`, and `typeCategories` (one nested
  map key — the pragmatic exception to the flat-strings convention);
  `DEFAULT_EDITOR_LABELS` extended; `TypePickerPopover` threads them
  (CanvasLabels grows the same keys).
- Category headings render `labels.categories[category] ?? category`.

### Behavior unchanged

Filtering (context + substring on name/description), maxPerSpec
disabling, selection contract (`onSelect(plugin.id)`), and both
`data-testid` conventions are untouched — existing tests stay green.

## Docs

- `spec-editor.mdx`: new labels-table rows; the Known Limitations entry
  about TypePicker's unrouted strings is removed.
- CLAUDE.md needs no change (TypePicker already listed).

## Testing

- Existing type-picker + insertion tests pass unmodified.
- New: custom labels render (placeholder, aria-label, empty state,
  category heading translated); at-max card carries the interpolated
  `maxReached` text (tooltip/title); category default headings are
  Title-cased.
- Runtime check: Storybook Build story — open the ⊕ popover, confirm
  on-system styling (hover state, tokens) and translated headings.

## Rejected

- B: strings-only routing (leaves raw lowercase category enums showing).
- C: command-palette redesign (bigger than the issue; grid works well).
