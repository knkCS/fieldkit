# SpecForm Tab-Shell Extraction + Read-Mode Search Parity (fixes #24)

**Date:** 2026-07-06
**Status:** Approved design (Approach A of three)
**Ships as:** fieldkit **0.4.1** (fieldkit-only; zero public API change)

## Problem

`SpecFormTabs` (edit) and `SpecFormReadTabs` (read) in
`src/renderer/spec-form/spec-form.tsx` duplicate ~50-55 structurally
identical lines — `activeTab` state, `useContainerOrientation`, the
`buildSearchIndex` memo, the reset-on-partition-change effect, the
search-node construction, and the whole `Tabs.Root` shell including the
vertical-search-outside-root placement. The fork exists because read
mode must not call react-hook-form hooks, but none of the duplicated
code touches RHF. The copies have already drifted once (the
vertical-search placement fix had to be applied twice).

Read mode also lags edit-mode quality:

- Its search **jump** queries `document` globally (no root scoping —
  breaks with multiple instances), skips `CSS.escape` (edit mode
  escapes for dotted/nested accessors), and never cancels its pending
  rAF or the 1.5s flash `setTimeout` on unmount.
- The `/` focus-search shortcut is bound only in `SpecFormTabs`.
- No test covers read-mode search, jump, or the shortcut at all; no
  test mounts a real `DrawerRoot` to prove the search's Escape
  containment protects a host drawer.

Both components are module-private (repo-wide grep: only `SpecForm`,
`SpecFormProps`, `SpecFormLabels` are consumed externally), so the
restructure is API-invisible.

## Decision — shared hook + shell (Approach A)

Rejected:
- *B: presentational `TabShell` only* — leaves the drift-prone
  duplicated state/effects (the documented failure mode) in place.
- *C: one component with a `mode` prop* — read mode can't call RHF
  hooks and hooks can't be conditional; decomposes back into A with
  worse seams.

## Changes

### 1. New internal `src/renderer/spec-form/tab-shell.tsx`

- **`useTabShell(partition: SpecPartition, defaultTabLabel: string)`**
  — owns `activeTab` state, `useContainerOrientation(partition.orientation)`,
  the `buildSearchIndex` memo, the reset-to-`tab-0`-on-partition-change
  effect, and creates a `rootRef`. Returns
  `{ activeTab, setActiveTab, orientation, containerRef, rootRef, searchIndex }`.
  Contains NO react-hook-form hooks — read mode calls it freely.
- **`TabShell`** — presentational shell with props
  `{ orientation, containerRef, rootRef, activeTab, onTabChange,
  searchNode, tabTriggers, children }`. Owns the outer `Box` (merging
  `containerRef` + `rootRef` once — replaces the duplicated `setRoot`
  plumbing), the vertical-search-outside-`Tabs.Root` placement (its
  explanatory comment lives here only), `Tabs.Root`
  value/onValueChange/orientation wiring, horizontal
  `Flex(Tabs.List flex="1" + searchNode)` vs vertical `Tabs.List`
  layouts. `children` are the `Tabs.Content` panels.
- Not exported from any barrel; `displayName` set.

### 2. Mode components shrink to their real differences

- `SpecFormTabs`: RHF hooks, `useTabIndicators` + badge/dirty triggers,
  submit-jump effect, focus-based `jumpTo` (pendingRef + token +
  effect + `focusFieldByAccessor`), `FieldRenderer` panels. Its `/`
  keydown effect and `setRoot` merge are DELETED.
- `SpecFormReadTabs`: read `jumpTo` + `ReadTab` panels.
- All existing edit-mode tab/orientation/search tests stay green
  UNMODIFIED — the refactor is behavior-invisible in edit mode.

### 3. `/` shortcut moves into `FieldSearch`

One document-level keydown listener inside `FieldSearch` (same
skip-while-typing guard: input/textarea/contentEditable), focusing its
own input — scoped via its own container element, with focus going
through the type-guarded handle
(`typeof handle?.focus === "function"`; on anker 3.1 + React 19 the
ref holds the raw input, whose native `.focus` passes the guard) and a
container-query fallback. Read mode AND the editor canvas search gain
the shortcut from the single implementation. Known minor (documented in
the mdx): with multiple search boxes mounted, the last-mounted
listener wins.

### 4. Read-jump parity

Adopts edit mode's pattern: `pendingJumpRef` + token + effect; query
scoped to `rootRef.current` (from `useTabShell`), selector uses
`CSS.escape(accessor)`; the rAF is cancelled and the 1.5s flash
`setTimeout` cleared on unmount. Scroll + box-shadow flash behavior is
otherwise unchanged.

### 5. Drawer containment FIX + proof

**Discovery (from the proof test itself):** the believed containment
was broken in production. Ark/zag's dismissable layer registers its
Escape listener on `document` in the CAPTURE phase, which always fires
before FieldSearch's bubble-phase `stopPropagation` — so Escape in an
open search dropdown inside `EditDrawer` closed the whole drawer,
losing in-progress edits. The old tests used a bare-div ancestor
stand-in and could not see this.

**Fix:** FieldSearch's Escape containment moves to a **`window`-level
capture listener, active only while the dropdown is open**. Capture
propagation runs outermost-first, so window-capture deterministically
precedes zag's document-capture listener regardless of registration
order (no same-node-ordering fragility — the rejected alternative).
While open: `stopPropagation` + close the dropdown (and clear, as
today). While closed: the listener no-ops and the drawer's own Escape
behavior is untouched. The old bubble-phase Escape branch in the input
keydown handler is removed (redundant — a window-capture stop never
reaches it). Existing bare-div containment tests must still pass with
the new mechanism.

- Integration test mounting anker's REAL `DrawerRoot` around a
  sectioned `SpecForm`: with the search dropdown open, Escape closes
  only the dropdown (`onClose` NOT called); a second Escape (dropdown
  closed) propagates and closes the drawer. This is now a regression
  test for the fix, not just a proof.
- New Storybook story: drawer + sectioned form (the combination the
  issue notes has no coverage), used by the runtime pass.

## Testing

- Existing suites green, edit-mode tab/search/orientation tests
  unmodified (refactor-invisibility pin).
- New read-mode tests: `/` focuses the read-mode search; cross-tab
  read jump switches tab and scroll+flashes the target row using a
  DOTTED accessor fixture (proves `CSS.escape`); jump query is scoped
  to the instance root; unmount with a pending jump/flash under fake
  timers produces no errors/act warnings.
- Drawer Escape pair as above.
- Runtime pass (Storybook): read-mode story — `/` focuses search,
  jump scrolls+flashes across tabs; drawer story — Escape sequence
  observed live.

## Docs

`spec-form.mdx`: search section states parity (`/` and jump behavior in
both modes), the multiple-instance shortcut note, and the drawer
Escape contract. No CLAUDE.md change (file layout unchanged except the
internal `tab-shell.tsx`, which the directory table gains).

## Release

fieldkit 0.4.1 via tag-driven CI after merge + final review; close #24.
