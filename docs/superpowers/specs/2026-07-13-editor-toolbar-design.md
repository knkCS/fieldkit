# Editor Toolbar — Design

**Date:** 2026-07-13
**Status:** Approved (brainstormed with Jesko in the visual companion; direction A2 of the mockup series in `.superpowers/brainstorm/`)
**Ships as:** fieldkit 0.9.0 (minor: default-label copy change + layout rework, no API breaks)

## Motivation

The editor's top chrome is two disconnected right-aligned clusters: the
header row (Build/Try it/Discard/Save) and a floating "+ Card + Section"
ghost-link row above the canvas. Insert actions look like afterthoughts and
the bar reads as noise. Reported during mediahub manual testing 2026-07-13.

## Decisions (locked during brainstorming)

1. **One unified toolbar (direction A), composition A2 — a pure tool row:**
   left → right: **▦ Card**, **⊞ Section** (outline buttons, icons =
   `cardPlugin`/`sectionPlugin` icons: `PanelTop`, `LayoutDashboard`),
   spacer, dirty-dot, **Build | Preview** segmented control, Discard,
   Save (solid primary).
2. **"Try it" renamed to "Preview" — default string only.** The `tryIt`
   label KEY stays; hosts with overrides are untouched. mdx labels table
   updated.
3. **Preview disables (never hides) the insert buttons** — the bar keeps
   its shape across modes.
4. **No title inside the bar.** The `title` prop remains supported and
   renders on its own line ABOVE the toolbar when provided (hosts like
   mediahub already show a page heading; nothing is duplicated).
5. The floating "+ Card + Section" row is **deleted** from both canvas
   layouts (sectionless and sectioned).

## Behavior

- **+ Card**: appends an untitled card to the ACTIVE tab (existing
  `insertCard` semantics incl. first-card auto-wrap). Disabled when: mode
  is Preview, or the spec is empty (today the button is hidden on empty —
  disabled + tooltip is the new behavior).
- **+ Section**: existing `insertSection` semantics. Disabled in Preview.
- **Build | Preview segmented control**: replaces the two mode buttons.
  The Preview segment inherits Try-it's gating (disabled while the draft
  has validation errors). Switching semantics unchanged (scratch form
  nonce, discard-on-return behavior identical to today).
- Dirty-dot moves next to the Discard/Save cluster (its consequence).
  Discard/Save behavior unchanged.

## Architecture

**Lift the active tab.** `EditorCanvas` currently owns the active-tab
state; "+ Card" needs it in the header. `SpecEditor` gains
`activeTabIndex` state and passes it to `EditorCanvas` as a controlled
prop (`activeTabIndex` + `onActiveTabChange`); the toolbar's insert
handlers call the draft ops with that index. Canvas behavior that resets
or moves the active tab (tab deletion, section ops) reports through
`onActiveTabChange`. This also makes future tab-scoped features
(deep-linking, per-tab actions) trivial.

Component shape: the toolbar row is extracted to
`src/editor/editor-toolbar.tsx` (pure presentational; props: mode,
dirty, canPreview, canInsertCard, labels, callbacks) so `spec-editor.tsx`
stays the orchestrator. `displayName` per convention; all strings via
`EditorLabels`.

## Labels

- `tryIt` default: `"Try it"` → `"Preview"` (key unchanged).
- `addCard`, `addSection`: keys and defaults unchanged (rendered with
  icons now).
- No new keys expected; if the empty-spec tooltip needs a string, add
  `addCardDisabledEmpty` with an English default and document it.

## Testing

- Editor RTL: toolbar renders both inserts; disabled states per mode /
  empty spec / invalid draft (each discriminating); + Card inserts into
  the active NON-FIRST tab (pins the lifted state — would fail if the
  toolbar hard-coded tab 0); Preview default label; segmented control
  switches modes with unchanged scratch-form semantics (existing try-it
  tests keep passing with only label-default updates).
- A depth-pin-style test that the canvas no longer renders the old
  floating row.
- Stories updated (Build/BuildWithCards show the new bar); the TryIt
  story's explanatory note updated for "Preview".
- spec-editor.mdx: labels table (`tryIt` default), toolbar contract
  section replacing the old header description, migration note (visual
  change only, no API change).

## Non-goals

The config-panel redesign (fieldkit#42); keyboard shortcuts; changes to
the ⊕ canvas insertion overlay; any renderer/table changes.
