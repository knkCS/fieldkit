# Follow-up Bundle — anker React-19 floor + name/ref fixes, fieldkit drill-frame fix (fixes anker#150, anker#151, fieldkit#35)

**Date:** 2026-07-07
**Status:** Approved design
**Ships as:** anker **4.0.0** (breaking: react peer floor) + fieldkit **0.5.0** (peer moves)
**Repos:** ~/repo/anker (lands first), ~/repo/fieldkit
**Purpose:** clear the last filed follow-ups and cut fresh releases so the
mediahub fieldkit bump (next project) targets the latest of everything.

## Findings that shaped this (recon)

- ref-as-prop (`{ ref, ...props }` on plain FCs) is anker's de facto
  convention: ~18 components across atoms and forms — not one straggler.
  Every knk surface (mediahub, fieldkit dev, anker dev) runs React 19;
  the `react >=18` peer defends a matrix nobody uses.
- anker#151's drop point: `src/atoms/text-input/text-input.tsx`
  destructures `name` and uses it only as `id={name}` — the `name` prop
  never reaches the DOM input.
- **New (bigger than #151):** the form wrappers spread `{...field}`
  (which includes react-hook-form's `field.ref`) and then OVERRIDE it
  with `ref={ref}` — RHF never registers the element, so `setFocus` and
  focus-on-first-error have been silently dead across every knk form.
  fieldkit's edit-jump has been surviving on its tier-2 (label/container)
  fallback alone.

## Decision (user): peer honesty over a forwardRef sweep

anker 4.0.0 bumps the react peer to `>=19` (zero component churn; the
ref-as-prop convention becomes officially supported). Rejected: the
~18-component `forwardRef` sweep preserving `>=18` — churn defending an
unused matrix. `SearchInput`'s 3.2.0 `forwardRef` stays as-is.

## Changes — anker (4.0.0)

1. **Peer floor (#150, BREAKING):** `peerDependencies.react` and
   `react-dom` → `">=19"`. CHANGELOG carries the breaking note (apps on
   React 18 must upgrade before taking 4.x; all known consumers already
   run 19). Close #150 on release.
2. **`name` attribute (#151):** `TextInput`'s inner `<Input>` gains
   `name={name}` beside the existing `id={name}`. Audit for sibling
   atoms with the same destructure-and-drop pattern (fix any found the
   same way).
3. **`field.ref` merge (new):** in every form wrapper that spreads
   `{...field}` and then sets `ref={ref}` (expected: input, textarea,
   select, number-input, date-picker, color-picker, code, switch —
   confirm per file at plan time), replace the override with
   `ref={mergeRefs(field.ref, ref)}` (Chakra v3 exports `mergeRefs`).
   Wrappers whose inner control cannot take a DOM ref keep their current
   shape (document per file). CHANGELOG flags the behavior restoration:
   failed submits now focus the first errored field (RHF's default,
   restored).
4. **Tests:** through `InputField` — the DOM input carries
   `name="<accessor>"`; RHF `setFocus(name)` focuses the input; a
   consumer ref and `field.ref` coexist (both see the element); a
   representative second wrapper (e.g. TextareaField) gets the
   name+setFocus pair too. Full gate.
5. **Docs:** CHANGELOG 4.0.0 (Breaking peer; Fixed name attr; Fixed/
   Restored RHF focus registration); CLAUDE-ANKER.md notes the React 19
   floor and the restored focus behavior.

## Changes — fieldkit (0.5.0, after anker 4.0.0 releases)

1. **#35 — drill-frame rename-follow indexing:** the rename-follow in
   `field-config-panel.tsx` rewrites the drill stack's LAST frame, but
   the active field resolves at `chain.length - 2` when a deeper frame
   is broken (child deleted under an open drill-in) — a rename in that
   state updates the wrong frame and orphans the drill path. Align the
   rename-follow with the frame resolution the 0.4.2 baseline
   forwarding already uses; regression test for broken-deeper-frame +
   rename.
2. **Dependencies:** devDependency `@knkcs/anker` → `^4.0.0`;
   peerDependency `@knkcs/anker` widens to `"^3.1.0 || ^4.0.0"`
   (4.0.0 removes no API fieldkit uses); **`react`/`react-dom` peers →
   `">=19"`** (honesty cascade). Peer movement is why this is 0.5.0,
   not 0.4.3.
3. **Verification bonus (no code):** with `name` + `field.ref` fixed
   upstream, the edit-jump's tier-1 `[name=…]` selector and tier-3
   `setFocus` fallback come alive against real anker fields — the
   runtime pass observes tier-1 matching for the first time; existing
   jsdom tests stay green (their harness inputs always had names).

## Testing summary

- anker: the name/setFocus/ref-coexistence tests above; existing suites
  green (the ref merge may WAKE dormant focus behavior in existing
  tests — treat any newly-focusing test as the restored default, adjust
  assertions only with justification in the report).
- fieldkit: #35 regression test; full suites; a quick check that
  submit-jump tests still pass with tier-3 now functional (they should —
  more working tiers, same outcomes).
- Runtime (Storybook): anker — submit a form with an error, first
  errored field receives focus; fieldkit — edit-jump focuses via tier-1
  against real anker inputs.

## Release order

1. anker: implement → merge → tag v4.0.0 → npm verified → close #150 +
   #151 → GH release.
2. fieldkit: bump deps → #35 → merge → 0.5.0 tagged/published → close
   #35.
3. Next project: mediahub fieldkit 0.0.2 → 0.5.0 bump (own brainstorm),
   targeting anker 4.0.0 + fieldkit 0.5.0.
