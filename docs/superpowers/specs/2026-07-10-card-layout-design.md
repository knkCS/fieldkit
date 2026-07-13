# Card Layout — Design

**Date:** 2026-07-10
**Status:** Approved (brainstormed with Jesko; mockup decisions made in the visual companion session, `.superpowers/brainstorm/`)
**Ships as:** fieldkit 0.8.0 (additive minor)

## Motivation

Metadata forms with many fields render as one undifferentiated column per tab.
Authors want to arrange a tab's fields into visual groups — white cards on the
canvas — without changing what the form stores. Requested during mediahub
manual testing 2026-07-10.

## Decisions (locked during brainstorming)

1. **Data model: flat layout marker.** A card is a `card` field in the flat
   schema, exactly like `section` one level down: fields after the marker
   belong to it until the next `card` or `section`. Purely visual — fields
   keep their top-level accessors; stored values are byte-identical. (The
   `group`-style children/container model was considered and rejected: it
   nests and repeats values, which is a different feature.)
2. **Layout: stacked.** One full-width card per row, in schema order. No
   side-by-side grid, no per-card widths.
3. **Title optional.** `config.name` is the title; empty = untitled (Build
   canvas shows italic "Untitled card", the rendered form shows a plain card
   with no header).
4. **All-in-cards per tab.** Once a tab contains a card marker, every field
   in that tab lives in a card. Adding the FIRST card to a tab with loose
   fields auto-wraps those fields into an untitled card, then appends the new
   empty card after it.
5. **Build canvas: header-bar treatment.** Every card renders a header row —
   card drag handle (moves the whole card), title, ⋯ menu. Header click
   selects the card; the config panel shows its one setting (Name).

## Schema layer

- New built-in plugin `src/schema/field-types/card.ts`, mirroring
  `section.ts`: `category: "structural"`, `fieldComponent: () => null`, no
  `cellComponent`, `toZodType: () => z.never()`, `defaultSettings: {}`,
  no `defaultValue`. Registered in `builtInFieldTypes`.
- `settings` carries nothing in v1. Title = `config.name` (may be empty).
  Accessor follows the existing auto-generation and uniqueness rules.
- `zod-builder.ts`: `STRUCTURAL_TYPES` gains `"card"` (both the schema path
  and the defaults path skip it).
- New pure helper `src/schema/partition-cards.ts`:
  `partitionTabByCards(fields: Field[]) → { cards: { card: Field | null,
  fields: Field[] }[], hasCards: boolean }`. `card: null` only for the
  implicit leading group (see degrade rule). Shared by SpecForm (edit +
  read), the editor canvas, and tests. React-free, like `partition.ts`.
- `validateSpec`: new rule — within a tab that contains at least one card
  marker, a field before the first marker is an error with code
  `loose_field_in_carded_tab`, following the existing error shape.
  The editor never produces this state; the rule catches hand-written
  schemas.

## Renderer layer

- **Graceful degrade (normative):** SpecForm renders leading loose fields in
  a carded tab as an implicit untitled card. A schema is data — rendering
  must never break on a validation violation.
- Card surface uses semantic tokens only: `bg` (white in light mode, correct
  elevated surface in dark), `border`, radius, subtle shadow; title as a
  small heading when non-empty; the existing 20px field rhythm inside.
  Tabs without cards render exactly as today (no wrapper element).
- Read mode renders the same card boxes with DescriptionList rows inside.
- Field search, cross-tab jump, submit-jump-to-first-error, tab error badges:
  no changes — they operate on the flat field list and DOM ids.
- Skeleton loading draws inside card frames.
- EditDrawer inherits cards via SpecForm; SpecDataTable ignores card markers
  exactly as it ignores sections.

## Editor layer

- **Canvas:** cards render as framed regions containing the normal field
  shells (selection, toolbar, insertion boundaries, ⊕ inserts scoped to the
  card body — all unchanged). Header row per Decision 5.
- **"+ Card"** sits next to "+ Section" and appends an empty card to the
  active tab, with the Decision-4 auto-wrap on first use in a tab.
- **Drag stays one-dimensional.** The canvas remains a single sortable list
  in flat schema order; cards are only how the list renders. Field drag
  mechanics are unchanged (dropping into another card = crossing the marker
  in flat order). The card header handle performs a block move
  (`draft-ops.ts: moveCard`) — marker plus contained fields as one unit —
  riding the existing ops/undo/dirty machinery.
- **Delete (⋯ menu):** *Delete card* merges the card's fields into the
  previous card (first card → into the next; only card → tab returns to the
  bare card-less state, which is legal again). *Delete card with fields*
  sits behind the existing destructive-confirm pattern.
- **Config panel:** selected card shows Name (title) with live draft editing,
  same semantics as field renames. (fieldkit#42's panel→tabs redesign
  subsumes this trivially.)
- New `EditorLabels` keys for every new string (addCard, cardUntitled,
  delete/merge menu items, panel strings), documented in the spec-editor.mdx
  labels table.

## Cross-system notes

- **mediahub follow-up (file on release):** add `"card"` to
  `asset-metadata-form.ts`'s `STRUCTURAL` set and the count/accessor guards;
  optionally teach `EnsureAssetSystemFields` to block-prepend missing system
  fields *after* a leading card marker instead of at absolute head. Until
  then the renderer's implicit-card degrade displays prepended system fields
  correctly.
- **anker#153:** inputs are currently transparent; once fixed they are
  white-on-white inside cards — the card border still separates them; eyeball
  at the runtime gate.

## Testing

- Pure: `partitionTabByCards` (no cards / cards / leading-loose degrade;
  input is one tab's fields — section markers never reach it because
  `partitionSchemaBySections` runs first), validateSpec rule, zod-builder
  skips.
- draft-ops: append, first-card auto-wrap, `moveCard` block move, all three
  delete-merge shapes, undo/dirty pins.
- Editor RTL: + Card end-to-end, header-select → panel title edit,
  delete-merge via menu, auto-wrap flow.
- Renderer RTL: carded rendering, implicit-card degrade, read-mode parity,
  Try-it smoke.
- Storybook: Build-with-cards + Try-it stories; contract sections in
  spec-editor.mdx and spec-form.mdx.

## Non-goals (v1)

Card duplication; per-card settings beyond the title; side-by-side card
layout; cards inside groups; any change to stored value shapes.
