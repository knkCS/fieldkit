# Renderer Redesign — SpecForm

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan
**Depends on:** @knkcs/anker ≥ 2.11.0 (upgraded 2026-07-03, commit 2ae8247)

## Context

All knkCMS solutions must share one UI/UX, defined by anker's design system
(`docs/design-system.md`), page patterns (`docs/page-patterns.md`, §10 Form
patterns), and `CLAUDE-ANKER.md`. Fieldkit's renderer predates these rules:
`FieldRenderer` emits a bare `<div>` with no spacing rhythm, the `section`
field type renders nothing, loading is a `"Loading..."` text node, and the
unknown-field alert uses inline red styles. Individual field components
already delegate to `@knkcs/anker/forms`, so the field-level anatomy is
sound; the gap is the layout layer above them.

This spec introduces that layer. It is also the foundation for the editor
redesign that follows (shared section partitioning, same section settings).

## Goals

- Render spec-driven forms that conform to anker form patterns in all four
  target containers: full-page edit (DetailPageTemplate body), settings
  Cards, modals, and fieldkit's SpecDataTable EditDrawer.
- Give the `section` field type its intended rendering: **tabs**.
- Add field search with jump-to-field across tabs.
- Add a true read-only view mode.
- Zero breaking changes: existing consumers of `FieldRenderer` keep working.

## Non-goals / out of scope

- No new field types. A collapsible "area" grouping was discussed and
  deliberately deferred; the partition utility must not preclude nesting
  later.
- No column/width layout in the schema.
- Editor redesign (separate project; consumes this spec's utilities).
- Form-state ownership changes: consumers keep `useForm()` + `FormProvider`.

## Architecture

New module `src/renderer/spec-form/`, exported from
`@knkcs/fieldkit/renderer`.

```
Consumer (solution / EditDrawer / modal)     — owns useForm(), FormProvider,
  └── SpecForm (NEW)                            save button, submit
        ├── TabStrip     — anker Tabs (horizontal) or nav-list (vertical)
        ├── FieldSearch  — anker SearchInput + results dropdown (internal)
        └── TabPanel × N — mounted, CSS-hidden when inactive
              └── FieldRenderer (EXISTING, unchanged) — flat field list
                    └── field components; GroupField recurses into
                        FieldRenderer (flat by construction — no tab
                        chrome can appear inside groups)
```

### SpecForm

```tsx
<SpecForm
  schema={spec}          // Field[] — sections partition it into tabs
  mode="edit" | "read"   // default "edit"; "read" = DescriptionList view
  readOnly?              // edit mode with controls locked
  loading?               // skeleton rows instead of fields
  labels?                // { defaultTab, searchPlaceholder, noResults } —
                         // translated strings per anker i18n convention
                         // (props, not keys); English defaults
/>
```

Stateless with respect to form data. Owns only UI state: active tab, search
text. Reads react-hook-form context (`formState`) for dirty/error
indicators and submit handling. Active tab resets when `schema` identity
changes.

Renders full-width with no `maxW` and no outer padding — the container
(template body, Card, modal, drawer) owns width and padding, per
CLAUDE-ANKER.

### partitionSchemaBySections(schema)

Pure function in `src/schema/` (zero React dependency — the editor redesign
reuses it). Returns ordered partitions:

```ts
{ tabs: Array<{ section: Field<SectionSettings> | null; fields: Field[] }> }
```

- Fields before the first section → implicit first tab (`section: null`,
  UI label "General").
- No sections in schema → single partition; SpecForm renders a flat form
  with **no** tab strip and **no** search.
- Sections with no fields still produce (empty) tabs — spec authoring
  errors surface visibly rather than silently disappearing.

### FieldSearch

Internal component (not exported initially) composing
`@knkcs/anker/forms` `SearchInput`.

## Schema change

`section` gains settings — the only schema change; no new field types:

```ts
export interface SectionSettings {
  orientation?: "horizontal" | "vertical"; // default "horizontal"
}
```

Orientation is a whole-form concern: SpecForm reads it from the **first**
section and ignores it on later ones. Existing specs (no settings) render
horizontal — fully backward compatible. `toZodType` stays `z.never()`.

## Runtime behavior

### Field rhythm

`FieldRenderer` wraps its field list in a 20px vertical stack (`Stack
gap="5"`), giving every form — tabs, flat, groups, EditDrawer — the anker
§10 rhythm. (Amended 2026-07-04: this was the spec's motivating gap but
was missing from the original behavior list.)

### Tabs

- Horizontal: anker `Tabs` strip above the form.
- Vertical: Chakra `Tabs` with `orientation="vertical"` (amended
  2026-07-04: shipped as native vertical tabs rather than the nav-list
  sub-nav pattern — semantically they are tabs), auto-degrading to
  horizontal when the container is narrower than ~560px (container query
  via `useContainerOrientation` hook) so drawers/modals never break.
- **All tab panels stay mounted; inactive panels are CSS-hidden.**
  Rationale: react-hook-form needs the DOM nodes for cross-tab error focus
  and search jump. This intentionally differs from anker *page* tabs
  (`lazyMount unmountOnExit`) — that guidance is about pages, not forms.

### Per-tab indicators

Computed by mapping `formState.dirtyFields` / `formState.errors` through
the partition:

- Tab holds unsaved changes → anker `DirtyDot` (yellow) on the trigger.
- Tab holds validation errors → red count badge; **replaces** the dot when
  both apply.

### Submit

Consumers own submit (save button in PageHeader / Card footer / drawer
footer per context). SpecForm watches `formState.submitCount`: when a
submit lands with errors, it switches to the first tab containing an
error, scrolls to and focuses the first invalid field.

### Field search

- Rendered only when the schema has ≥ 1 section. Placement: right-aligned
  in the tab-strip row (horizontal) / above the nav list (vertical).
- Case-insensitive substring match on field **label** and **api_accessor**
  across all tabs; hidden fields excluded.
- Results dropdown shows label + tab name; "No fields found" empty row.
- Keys: `/` focuses search (unless an input has focus), `↑↓` navigate,
  `Enter` jumps, `Esc` closes.
- Jump: switch tab if needed → scroll into view → focus input → highlight
  ring fading over ~1.5 s. In read mode: highlight without focus.

### Read mode (`mode="read"`)

- Same tabs and search.
- Each tab renders an anker `DescriptionList` with one `Row` per field.
- Values render through the plugin's existing **cell component** (same
  formatter as SpecDataTable); plugins without a cell, and empty values,
  fall back to plain text / em dash.
- Groups render each item as an indented block of rows.
- `readOnly` (edit mode, locked controls) is unchanged and per-field
  `read_only` is still honored.

### Loading

`loading` renders skeleton rows (one per field, capped at 8) plus a
skeleton tab strip when sections exist. Chakra v3 `Skeleton` primitives,
anker tokens. Replaces the `"Loading..."` div.

### Required/optional markers (anker §10)

Rule: one convention per form. SpecForm counts required vs optional
fields; mostly-optional forms mark required fields with `*` (supported
today), mostly-required forms mark optional fields with "(optional)";
ties use the asterisk convention.
**Blocked on anker:** `FormField` has no optional-marker prop. File an
anker issue for `optionalText`; ship asterisk-only until it lands. The
convention logic ships with the partition so enabling it later is trivial.

## Error handling

- Unknown field type: anker feedback `Alert` (error variant, tokens)
  replaces the inline-styled red div in `FieldComponent`. Verify the
  needed variant exists in `@knkcs/anker/feedback` at implementation;
  file an anker issue if not.
- `FieldErrorBoundary` stays per field; fallback restyled the same way.
- Empty schema → SpecForm renders nothing (spec validity is
  `validate-spec`'s job).

## Testing

- `partitionSchemaBySections` (pure): no sections; fields before first
  section; multiple sections; orientation read from first section only;
  empty schema; empty sections.
- `SpecForm` (RTL, `FormProvider` wrapper): tabs render/switch; inactive
  panels in DOM but hidden; DirtyDot on edit; error badge + count after
  failed submit; submit jumps to first error across tabs; search filters,
  Enter switches tab and focuses field; read mode renders DescriptionList
  via cell components; loading skeletons; sectionless schema renders flat
  with no chrome.
- `useContainerOrientation` hook tested in isolation (jsdom has no
  container queries).
- Stories + MDX: horizontal, vertical, sectionless, read mode, loading,
  in-drawer; a11y addon clean.

## Rollout

1. Ship `SpecForm` additively as `0.1.0`. No deprecations — 
   `FieldRenderer` remains the documented flat renderer ("used inside
   groups and by SpecForm; embed SpecForm unless you know why not").
2. Migrate fieldkit's own `EditDrawer` to `SpecForm` in the same release
   (proves the drawer context; models correct usage).
3. File anker issues: `FormField` `optionalText`; feedback `Alert`
   variant if missing.
4. Editor redesign (next project) consumes `partitionSchemaBySections`
   and `SectionSettings`.

## Design decisions log

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Layout layer placement | New `SpecForm` shell over unchanged `FieldRenderer` | Layout-aware `FieldRenderer` (hidden dual behavior, group-recursion guard); exported primitives (guarantees drift) |
| Section rendering | Tabs (horizontal/vertical via `SectionSettings`) | Heading/divider treatment |
| Collapsible "area" grouping | Deferred — not in this release | New structural type now; section display variant |
| Field search UI | Inline `SearchInput` in tab row | ⌘K overlay palette (no anker component; collides with app-level palette) |
| Tab panel lifecycle | Mounted, CSS-hidden | `lazyMount unmountOnExit` (breaks RHF focus/jump) |
| Read-mode value rendering | Reuse plugin cell components in `DescriptionList` | Third per-type renderer |
