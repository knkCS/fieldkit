# Editor Redesign — WYSIWYG SpecEditor

**Date:** 2026-07-04
**Status:** Approved design, pending implementation plan
**Depends on:** SpecForm renderer redesign (spec 2026-07-03, shipped in
v0.1.0) — `partitionSchemaBySections`, `SectionSettings`, `SpecForm`,
`FieldSearch`, field rhythm.

## Context

The current SpecEditor is an abstract row list (drag handle, type icon,
name, accessor) with a 564-line modal per field and a bottom "Add field"
button. Spec authors never see what they are building; configuration
hides the form it configures. All styling is inline CSS, off the anker
system.

The redesign makes the editor WYSIWYG: the canvas renders the real form
exactly as `SpecForm` would — real tabs, real anker field components,
placeholders but no data — and authors edit the spec by interacting with
that preview.

## Goals

- The editing canvas looks like the rendered form (fidelity by
  construction: it reuses the renderer's building blocks).
- More user-friendly: click-to-configure with live preview, inline
  insertion, in-place section editing, field search.
- A "Try it" mode where the form actually works (validation, error
  badges) on throwaway data.
- Draft session with Save/Discard, matching anker's Dashboard edit
  pattern.
- anker-conformant visuals throughout (kills the inline CSS).

## Non-goals / out of scope

- The deferred `area` field type (unchanged from renderer spec).
- Multi-field selection / bulk operations.
- Undo history beyond Discard.
- Palette-drag insertion (the ⊕ insertion point is the only path).
- Schema/type changes: the editor edits `Field[]` exactly as today.

## Public API (breaking, ships as 0.2.0)

```tsx
<SpecEditor
  schema={savedSpec}            // committed spec; draft seeds from it
  onCommit={(schema) => …}      // fires ONLY on Save
  onDirtyChange?={(d) => …}     // for host guards / tab dots
  plugins={plugins}
  context?="form"               // unchanged filtering semantics
  labels?={…}                   // translated strings (anker convention)
/>
```

`labels` extends the renderer's `SpecFormLabels` (defaultTab, search
strings — passed through) with editor strings: `save`, `discard`,
`build`, `tryIt`, `testSubmit`, `addSection`, `moveToSection`,
`deleteSectionConfirm`. English defaults.

`onChange` is removed. Migration: consumers delete their own
persist-on-every-edit handling; the editor owns the draft and hands over
a finished spec on Save. Changelog carries the migration note.

## Architecture

Approach: **EditorCanvas composes renderer pieces** (chosen over adding a
design mode to SpecForm — wrong layer for dnd/selection weight — and over
a split list+preview view, which keeps editing abstract).

```
src/editor/
  spec-editor.tsx          shell: header (title + dirty dot, Build/Try-it
                           toggle, Discard/Save), layout, mode switch
  use-spec-draft.ts        draft state: seed, edit ops, dirty, save, discard
  editor-canvas.tsx        Build mode: tabs + inert fields + affordances
  field-shell.tsx          per-field wrapper: selection, toolbar, dnd
  field-config-panel.tsx   side panel frame (selected field)
  panel-sections/          dismantled FieldModal, one file per section:
                           config, validation, settings
                           (condition editing deferred: FieldCondition
                           exists in the schema but the renderer does not
                           evaluate conditions yet — an editor UI for it
                           would configure dead settings; amended
                           2026-07-04 during planning)
  type-picker-popover.tsx  existing TypePicker content, re-homed
  section-menu.tsx         per-tab ⌄ menu (rename, move, delete, orientation)
```

`FieldModal` is deleted. Dependency direction: `/editor` → `/renderer`
and `/schema`, never the reverse.

### Draft session (`useSpecDraft`)

- Seeds from the `schema` prop; every edit produces a new draft
  immutably; partition/tab structure is always derived via
  `partitionSchemaBySections`, never stored.
- `save()` → `onCommit(draft)`. `discard()` → reset to `schema`.
- External `schema` identity change resets the draft (same rule as
  SpecForm's tab reset).
- Dirty = draft ≠ schema; surfaced via `onDirtyChange` and the header
  dot. Try-it scratch data lives outside the draft entirely.

## Build mode — canvas interaction

**Inert fields.** One scratch `useForm` seeded from spec
`default_value`s makes real field components render authentically. Each
field sits in a `FieldShell`: field content gets `pointer-events: none`,
`tabIndex={-1}`, `aria-hidden`; the shell is clickable — click selects
and opens the config panel. `FieldErrorBoundary` wraps shells (broken
plugin → anker Alert, canvas survives).

**Selection.** Single selection; primary outline + floating toolbar:
drag ⠿, edit ✎ (focuses the panel's Label input), duplicate ⧉ (copy
below, accessor uniquified as `<accessor>_copy`, `_copy2`, …; selected),
delete 🗑 (immediate; Discard is the safety net). Escape deselects and closes the panel.

**Drag & drop.** dnd-kit, Pointer + Keyboard sensors (keyboard reorder
preserved): vertical sort within a tab; dragging over a tab trigger
activates that tab for cross-tab drops; "Move to section…" in the
toolbar menu is the discoverable/keyboard fallback. Reorders rewrite the
draft's flat field order.

**Insertion.** Hover gap (or empty-tab drop zone) → ⊕ → `TypePicker`
popover → inserts a field with the plugin's defaults at that index,
selects it, focuses the Label input.

**Sections.** "+ Section" on the strip appends a tab. Per-tab ⌄ menu:
rename inline, move left/right, delete (with confirm; the section's
fields merge into the preceding tab — deleting the *first* section makes
its fields leading fields, i.e. the implicit "General" tab). "Tab orientation" appears only in the first
section's menu (form-wide setting per renderer spec). Sectionless spec →
flat canvas, "+ Section" still offered.

**Search.** `FieldSearch` reused in the strip; a jump selects the field
and opens its panel.

**Validation.** `validateSpec` runs on the draft after every edit:
offending shells get a danger outline, the panel shows the message, tabs
with invalid fields get the SpecForm error badge, and **Save is disabled**
while structural errors exist — `onCommit` can only receive a valid spec.

## Config panel

Right-hand panel (anker surface tokens), rendered when a field is
selected. Sections from the dismantled FieldModal: base config (label,
accessor, instructions, required, …), validation, type-specific settings
(plugin `settingsComponent`), condition. Edits apply to the draft on
change — the canvas previews them live (rename the label, watch the
canvas update).

**Groups.** A group renders as a framed preview naming its child count;
selecting it shows group config plus a children list in the panel.
Children are edited by drilling in (panel back button returns) — canvas
dnd stays one-level.

## Try-it mode

Header toggle swaps canvas+panel for the real renderer:

```tsx
<FormProvider {...useForm({
  resolver: zodResolver(specToZodSchema(draft, plugins)),
  defaultValues: getDefaultValues(draft),
})}>
  <SpecForm schema={draft} />
  … Test submit button …
</FormProvider>
```

- "Test submit" runs validation — authors see error badges, submit-jump,
  required markers behave; success shows a toast; nothing persists.
- Adapters come from the consumer's `FieldKitProvider`, so
  reference/media fields work.
- Scratch data is discarded on any exit from Try-it.
- Toggle disabled (with tooltip) while the draft has structural errors.

## Error handling

- Canvas: per-field `FieldErrorBoundary`; unknown types render the
  existing anker Alert.
- Draft: `validateSpec` gates Save (above).
- Panel: accessor edits validate for uniqueness/format inline.

## Testing

- `useSpecDraft` unit tests: seed, edit, dirty, save, discard,
  external-schema reset.
- Canvas RTL tests via action paths: select, duplicate, delete, insert
  via type picker, "Move to section…", section rename/delete-merge,
  validation badge + Save disabled. Reorder via dnd-kit keyboard sensor
  (jsdom pointer-drag is unreliable; keyboard exercises the same logic).
- Panel: live-preview test (label edit updates canvas text).
- Try-it: SpecForm swap renders; scratch data does not survive the mode
  switch; toggle disabled on invalid draft.
- Stories: Build, Try-it, sectionless, empty spec; a11y addon clean.

## Rollout

1. Ships as **0.2.0** (breaking `SpecEditor` API). Migration note in the
   changelog: `onChange` → `onCommit`, remove consumer-side
   save-per-edit.
2. `FieldModal` deleted; `TypePicker` re-homed as popover.
3. Editor MDX rewritten around the canvas; CLAUDE.md editor layer line
   updated.
4. knkCMS consumers migrate at their own pace (0.1.x stays available).

## Amendments — 2026-07-04 senior design review

Adopted before implementation started:

1. **Live preview mechanics**: `FieldComponent`'s memo becomes
   identity-based (`prev.field === next.field`) — the only `/renderer`
   change this project makes. Draft-ops preserve untouched field
   identities, so exactly one shell re-renders per panel keystroke.
2. **Accessor edits are gated**: the panel holds the accessor as local
   state and applies it to the draft only when non-empty and
   collision-free (mirrors old FieldModal's error gate). Editing the
   accessor of a **committed** field (present in the `schema` baseline)
   shows an inline warning that existing stored data will disconnect.
3. **Draft reset guard**: an incoming `schema` prop that is
   content-equal to the current baseline does NOT reset the draft
   (consumers may pass fresh arrays every render). A genuine content
   change while dirty keeps the draft and surfaces a conflict notice.
4. **`onCommit` may return a Promise**: `save()` awaits it; on
   rejection the draft stays dirty and an error toast shows. Fire-and-
   forget consumers are unaffected.
5. **System fields are locked**: `system: true` fields show a lock
   indicator, cannot be deleted, and their accessor is read-only.
   Duplicating any field forces `system: false` on the copy.
6. **Delete gets a single-level undo toast** (restores the field at its
   old position); Discard remains the whole-session safety net.
7. **`moveSection` left on the first section is a no-op** (the implicit
   tab cannot be displaced).
8. **Keyboard support**: field shells are focusable
   (`role="button"`, `tabIndex=0`, Enter/Space selects) — selection,
   toolbar, and keyboard dnd are reachable without a mouse.
9. **Full i18n**: every author-facing string goes through
   `EditorLabels` (toolbar tooltips, insertion trigger, hidden-field
   row, panel headings, empty states, confirm texts with `{section}`
   interpolation). `validateSpec` field errors gain a stable `code` so
   the editor can render translated messages.
10. **Config parity**: the panel adds a `localizable` checkbox
    (documented `FieldConfig` key that no editor generation has ever
    exposed). Group child *editing* exists (drill-in); adding/removing
    children stays out of scope and is documented.
11. **Groups on canvas** render the framed preview from this spec via an
    explicit branch (the real `GroupField` renders an empty state that
    reads as broken).

## Design decisions log

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Canvas fidelity | EditorCanvas composes renderer pieces (partition, field components, FieldSearch); Try-it renders SpecForm itself | `mode="design"` on SpecForm (editor weight in renderer layer); split list+preview (editing stays abstract) |
| Edit propagation | Draft + Save/Discard (`onCommit`), Dashboard pattern | Live `onChange` (leaks half-finished edits); dual API (two code paths) |
| Field configuration | Side panel with live preview | Modal (hides the form); inline popover (too cramped for full settings) |
| Row list | Removed — canvas is the only view | View toggle (two views to maintain) |
| Cross-tab move | Drag onto tab trigger + "Move to section…" fallback | Menu-only (clunkier) |
| Canvas modes | Build + Try it | Build only |
