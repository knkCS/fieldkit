# Hygiene Bundle — anker dirtyLabel + SearchInput handle, fieldkit label hardening + FieldSearch polish (fixes anker#149, fieldkit#32, fieldkit#33)

**Date:** 2026-07-06
**Status:** Approved design
**Ships as:** anker **3.2.0** (minor; announcement-text defaults change) + fieldkit **0.4.0**
**Repos:** ~/repo/anker (lands first), ~/repo/fieldkit

## Problem

Three clusters of leftover debt:

1. **anker#149** — `FormField`'s per-field inline dirty dot hardcodes
   `aria-label="ungespeicherte Änderung"` with no prop; `DirtyDot` and
   `DirtyCounter` default to German too, while every other default
   string in the suite is English.
2. **fieldkit#32** — SpecForm/SpecEditor/TypePicker merge labels via
   `{ ...DEFAULTS, ...labels }`, so explicit-`undefined` keys clobber
   defaults; TryItView carries five conditional spreads to work around
   it.
3. **fieldkit#33** — FieldSearch polish: the no-results row sits inside
   `role="listbox"` (screen readers announce silence), the input's
   accessible name is placeholder-only, typed text lingers after a
   jump (anker `SearchInput` is uncontrolled with no clear API), and
   `"{count} invalid fields"` reads "1 invalid fields" at count 1.

## Decisions

- **Defaults flip to English** (user decision): `"Unsaved changes"` /
  `"{count} unsaved changes"`. German apps pass labels/provider.
- **dirtyLabel rides the existing `FormMarkers` context** (approach
  chosen over prop-only): one provider at the form root labels every
  field's dot; fieldkit reuses its `unsavedChanges` label. Rejected:
  prop-only forwarding (would require all 24 fieldkit field components
  to participate — the same trap rejected in the marker design).
- **SearchInput gets a ref handle, not a controlled mode** (chosen):
  `clear()` on the uncontrolled DOM input — no state refactor, zero
  behavior change for existing consumers (mediahub pickers). Rejected:
  controlled `value` prop (fights the debounce — the prop lags
  keystrokes; an effect-sync clobbers fast typing) and key-remount
  (drops keyboard focus after Escape).

## Changes — anker (3.2.0)

1. **`FormMarkers` gains `dirtyLabel?: string`** (form-level default
   for dirty-state announcements). `FormFieldProps` gains
   `dirtyLabel?: string`. The inline dot's aria-label resolves
   **prop → context → `"Unsaved changes"`** (replacing the hardcoded
   German). Dot markup otherwise untouched; wrappers forward the new
   prop via their existing `...rest` spread.
2. **Default flips:** `DirtyDot` label default → `"Unsaved changes"`;
   `DirtyCounter` label default → `"{count} unsaved changes"`. Their
   existing `label` props are unchanged. Update their tests asserting
   the old German defaults.
3. **`SearchInput` ref handle:**
   `export interface SearchInputHandle { clear: () => void; focus: () => void }`,
   accepted via React 19-style `ref` prop. `clear()`: set the DOM
   input's value to `""`, cancel the pending debounce, call
   `onSearch("")`. `focus()`: focus the input. Component stays
   uncontrolled.
4. **Tests:** dirtyLabel resolution (prop beats provider beats English
   default); provider labels the dot form-wide; DirtyDot/DirtyCounter
   new defaults; `clear()` empties the input + fires `onSearch("")`
   exactly once + cancels a pending debounce (fake timers); `focus()`.
5. **Docs:** CHANGELOG 3.2.0 flags the three announcement-text default
   changes + the two new APIs; CLAUDE-ANKER.md forms/markers section
   updated. Closes anker#149 on release.

## Changes — fieldkit (0.4.0, after anker 3.2.0 releases)

1. **`mergeLabels(defaults, overrides)`** — new shared util at
   `src/renderer/merge-labels.ts` (skips `undefined` values in
   `overrides`; the editor already imports renderer internals, e.g.
   TabErrorBadge), adopted by SpecForm
   (`resolvedLabels`), SpecEditor (`mergedLabels`), and TypePicker
   (keeping its nested `categories` per-key merge). TryItView's five
   conditional spreads collapse back to plain forwarding. Closes #32.
2. **Dirty-dot threading:** SpecForm's `FormMarkersProvider` value
   gains `dirtyLabel: resolvedLabels.unsavedChanges` in BOTH
   conventions (orthogonal to asterisk mode — asterisk mode's value is
   no longer `{}`). The editor canvas provider does the same via a new
   `EditorLabels.unsavedChanges?: string` (default `"Unsaved changes"`;
   `EditorLabels.dirty` labels the HEADER dot — a different surface —
   and stays unchanged).
3. **Pluralization:** `tabErrorsOne?: string` (default
   `"1 invalid field"`) on `SpecFormLabels` and `EditorLabels`
   (+ CanvasLabels optional block + TryItView passthrough). A shared
   `formatCount(one, many, count)` helper is used at both badge call
   sites (SpecFormTabs, EditorCanvas).
4. **`searchLabel`** (default `"Find field"`) on `SpecFormLabels` and
   `EditorLabels` (+ CanvasLabels + TryItView passthrough), rendered
   as the search input's `aria-label` — a real accessible name instead
   of placeholder fallback.
5. **No-results announcement:** when open with zero results,
   FieldSearch renders an EMPTY `role="listbox"` (keeps
   `aria-controls` valid) and the no-results text as a SIBLING with
   `role="status"` so it is announced. Options-present rendering is
   unchanged.
6. **Stale-text clear:** FieldSearch holds a
   `useRef<SearchInputHandle>`; `jump()` and Escape call
   `searchRef.current?.clear()` IN ADDITION to `setQuery("")` (kept),
   so on anker 3.1 the behavior degrades to exactly today's
   (stale text, dropdown still closes).
7. **Deps:** devDependency `@knkcs/anker` → `^3.2.0`;
   **peerDependencies stay `"^3.1.0"`** — every 3.2-dependent feature
   degrades gracefully (unknown context key ignored by 3.1's
   FieldLabelMarkers; guarded ref). Documented in the mdx notes.
8. **Docs:** spec-form.mdx + spec-editor.mdx label tables gain the new
   rows; prose enumerations updated. Closes #32 and #33 on release.

## Testing summary

- anker: the resolution/default/handle tests above; full gate.
- fieldkit: `mergeLabels` units + a TryItView regression (omitted keys
  fall through to SpecForm defaults — now via plain forwarding);
  per-field dot announces "Unsaved changes" through SpecForm and via
  label override; badge label reads "1 invalid field" at count 1 and
  "2 invalid fields" at 2 (both call sites); `searchLabel` renders as
  the input's aria-label + override; empty-state text announced
  (`role="status"`) while the combobox stays expanded with a valid
  (empty) listbox; existing suites stay green.
- Runtime (Storybook): SpecForm — dirty a field, inspect the per-field
  dot's aria-label; search for a non-match and confirm the status
  element in the AX tree; jump and confirm the input text clears.

## Release order

1. anker: implement → merge → tag v3.2.0 → npm verified → close #149.
2. fieldkit: devDep bump → implement → merge → 0.4.0 tagged/published →
   close #32 + #33, release notes name the 3.2.0 pairing.
