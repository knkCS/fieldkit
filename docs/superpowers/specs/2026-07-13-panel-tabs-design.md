# Config Panel Tabs + Persistent Drag Handle — Design

**Date:** 2026-07-13
**Status:** Approved (brainstormed with Jesko in the visual companion; container/handle/composite mockups in `.superpowers/brainstorm/`)
**Closes:** fieldkit#42, fieldkit#41, fieldkit#40 (absorbed)
**Ships as:** fieldkit 0.10.0 (minor: visual rework + new label keys, no API breaks)

## Motivation

The config panel's collapsible General/Validation/Type-settings sections are
easy to overlook (Jesko: prefers core's tab presentation); the drag handle
only exists in the selection toolbar, so reordering requires selecting
first. Both reported during mediahub manual testing.

## Decisions (locked during brainstorming)

1. **Container: side panel with tabs (mockup A).** NOT a modal, NOT a
   drawer. Live draft editing stays exactly as today — the redesign changes
   chrome only; the accessor-gate, rename-baseline machinery, and
   per-keystroke apply are untouched.
2. **Tab set: General | Validation | Type settings.** General = Name,
   Accessor, Required/Hidden/Read-only/Localizable, Instructions, Default
   value (today's General section). Validation = today's validation
   section. Type settings = the plugin's `settingsComponent`.
3. **Tab behavior:** panel-local state; General is the default; the active
   tab RESETS to General whenever the selected field changes (including
   drill-in frame changes).
4. **Duplicate-accessor banner renders ABOVE the tab strip** — visible from
   any tab.
5. **Edge cases keep their existing semantics:** system fields — the
   read-only summary REPLACES the tabs entirely (0.6.0 contract unchanged);
   cards — single Name body, NO tab strip; group drill-in — Back row above
   the header, child fields get the full 3 tabs.
6. **Drag handle (#41): always visible (mockup A)** — a grip before the
   field name on every shell, exactly like card headers. It becomes THE
   handle: the selection toolbar drops its grip button. Keyboard drag,
   Escape-cancel scoping, and system-field drag+lock behavior carry over.
7. **#40 is absorbed:** the panel gets a FIXED width (`width`, not
   `minWidth`) so system/custom/card selections render identical panel
   size.

## Architecture

- `field-config-panel.tsx`: the collapsible sections are replaced by anker
  Tabs; the existing `panel-sections/` components become the three tab
  bodies (near-zero changes inside them). Panel-local `activeTab` state
  with a reset effect keyed on the selected accessor + drill frame.
  Structure order: Back row (drill-in) → header (name/type/close) →
  duplicate-accessor banner → tab strip → tab body. System-field and card
  branches short-circuit before the tab strip.
- `field-shell.tsx`: always-visible grip (same `GripVertical`, `size` per
  the card-header idiom) rendered before the field name; the `useSortable`
  attributes/listeners move from the toolbar button to this grip. The
  selection toolbar keeps Edit/Duplicate/Delete (and the system lock badge)
  but loses its grip button.
- New `EditorLabels` keys: `panelTabGeneral`, `panelTabValidation`,
  `panelTabType` (English defaults: "General", "Validation",
  "Type settings"), documented in the mdx labels table. No key renames.

## Testing

- Panel RTL (each discriminating): tab switching renders the right body;
  active tab resets to General on selecting a DIFFERENT field (pin: switch
  to Validation, select another field, expect General active); the banner
  is visible while the Validation tab is active; the four states (normal /
  system / card / drill-in child) render the right chrome (tabs vs summary
  vs single-Name vs Back+tabs).
- Fixed width pin: panel width identical across a system field and a
  custom field selection (#40's complaint).
- Shell RTL: grip visible WITHOUT selection; drag works from an unselected
  shell (the #41 complaint — discriminating against the old
  selection-toolbar-only handle); the toolbar no longer contains a drag
  button (single-source pin, screen-level); keyboard drag + Escape-cancel
  behavior preserved (existing dnd tests updated to grab the new grip).
- Stories + spec-editor.mdx: panel contract section rewritten for tabs;
  labels table gains the three keys; migration note (visual only, tab
  captions themable).

## Non-goals

Apply/cancel semantics (live editing stays); modal or drawer containers;
panel resizing/collapsing; hover-reveal handles; fieldkit#43/#44 items;
renderer/table changes.
