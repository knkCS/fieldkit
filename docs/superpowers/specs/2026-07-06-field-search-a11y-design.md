# FieldSearch Combobox A11y + Badge Announcements (fixes #25)

**Date:** 2026-07-06
**Status:** Approved design (Approach A of two)
**Ships as:** fieldkit **0.3.2** (fieldkit-only; no anker change needed)

## Problem

`src/renderer/spec-form/field-search.tsx` is a functional typeahead but
not an ARIA combobox: the input carries no `role="combobox"`,
`aria-expanded`, or `aria-activedescendant` linkage to the highlighted
`role="option"` row, so screen readers perceive a plain text input.
Three adjacent defects ride along (#25):

- The `highlighted` index is not clamped against the current results: a
  schema hot-swap that shrinks the `index` prop while the query text is
  unchanged can leave `highlighted` past the end — Enter silently
  no-ops.
- The inline `onSearch` arrow recreates anker `SearchInput`'s internal
  lodash debounce on every parent re-render.
- Tab indicators announce badly: the error badge reads as a bare number
  ("SEO 2"), and SpecForm renders `<DirtyDot />` bare, so dirty tabs
  announce anker's hardcoded German default ("ungespeicherte
  Änderungen").

## Decision — hand-wire the ARIA pattern; no component swap

anker's `SearchInput` spreads rest props onto its Chakra `Input`, so
the combobox attributes pass through with **zero anker changes**.
Rejected: rebuilding on Chakra 3.34's `Combobox` — it would replace the
debounced `SearchInput`, introduce an anker-untuned recipe surface, and
put the EditDrawer Escape-containment quirk and cross-tab jump at
regression risk; a component swap to fix a wiring gap.

## Changes — `field-search.tsx`

1. **Ids:** `useId()` → `${uid}-listbox` for the dropdown,
   `${uid}-option-${i}` per row.
2. **Input** (via `SearchInput` rest props): `role="combobox"`,
   `aria-expanded={open}`, `aria-controls={open ? listboxId :
   undefined}`, `aria-autocomplete="list"`,
   `aria-activedescendant={open && results.length ? highlightedOptionId
   : undefined}`.
3. **Dropdown:** `id={listboxId}` on the existing `role="listbox"` Box;
   each row gets `id={optionId(i)}` beside its existing
   `role="option"`/`aria-selected`.
4. **Clamp by derivation** (no effect):
   `safeHighlighted = results.length ? Math.min(highlighted,
   results.length - 1) : 0`, used for `aria-selected`, row background,
   `aria-activedescendant`, Enter, and as the base for ArrowUp/Down
   moves. A shrunk result set can never leave Enter pointing past the
   end.
5. **`onSearch` → `useCallback`** (empty deps — both state setters are
   stable), so `SearchInput` stops rebuilding its debounce per parent
   re-render.
6. **Unchanged:** Escape containment (`stopPropagation` protecting
   EditDrawer), jump-and-clear semantics, `data-testid` conventions,
   two-column row layout, debounce timing.

## Changes — badge announcements

1. **`TabErrorBadge`** (`tab-error-badge.tsx`, shared by SpecFormTabs
   and EditorCanvas): gains required `label: string`, rendered as
   `aria-label` on the badge span. In accessible-name computation the
   label replaces the bare count, so a tab announces
   "SEO, 2 invalid fields". Callers interpolate the count into a
   translatable template.
2. **DirtyDot on tab triggers:** SpecFormTabs (the only tab strip that
   renders a DirtyDot — the editor canvas shows only error badges, and
   the editor header's dot is already labeled via `EditorLabels.dirty`)
   passes `label={...}` — English default, translatable.
3. **Labels:** `SpecFormLabels` gains `tabErrors?: string` (default
   `"{count} invalid fields"`, `{count}` interpolated) and
   `unsavedChanges?: string` (default `"Unsaved changes"`).
   `EditorLabels`/`CanvasLabels` gain only `tabErrors` (no canvas
   DirtyDot exists). mdx label tables in `spec-form.mdx` and
   `spec-editor.mdx` gain the rows.

## Scope guard

anker `FormField`'s **per-field inline dirty dot** also hardcodes the
German aria-label (`form-field.tsx:91`) and has no prop to change it —
that is what anker#148 was actually about before it was closed against
the standalone `DirtyDot` atom. Fixing it needs an anker API addition,
so it is explicitly out of scope here; a precise new anker issue is
filed during execution (referencing the line and the closed #148).

## Testing

- Combobox wiring: input has `role="combobox"`; `aria-expanded` flips
  with the dropdown; `aria-activedescendant` tracks ArrowDown/ArrowUp
  and always equals the id of the row with `aria-selected="true"`.
- Clamp regression: search with N results, rerender with a smaller
  `index` (same query) → Enter jumps to the last remaining result
  (previously a silent no-op).
- Badges: a tab with errors has an accessible name containing
  "2 invalid fields"; a dirty tab announces "Unsaved changes"; both
  strings overridable via labels (SpecForm and editor).
- Existing FieldSearch/spec-form tests stay green (behavior unchanged).
- Runtime check (Storybook): keyboard pass — type, arrows move the
  highlight, Enter jumps cross-tab, Escape closes without bubbling
  (EditDrawer stays open); accessibility-tree inspection of the input
  (combobox, expanded, activedescendant) and of a badged tab's name.

## Release

fieldkit 0.3.2 via tag-driven CI after merge + final review. Close #25
from the release; file the anker FormField-dot issue.
