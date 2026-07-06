# Toaster Dedupe + 0.3.1 Follow-ups (fixes fieldkit#28, fieldkit#31)

**Date:** 2026-07-06
**Status:** Approved design (Approach B of three for #28)
**Ships as:** anker **3.1.1** (patch) + fieldkit **0.3.1** (patch)
**Repos:** ~/repo/anker (lands first), ~/repo/fieldkit

## Problem

1. **#28 — duplicate toasts.** `SpecEditor` mounts anker's `<Toaster />`
   internally (`spec-editor.tsx:435`); anker's `toaster` is a
   module-singleton store. A host app that already mounts a global
   `<Toaster />` renders every editor toast twice: two regions, one
   store.
2. **#31 — marker-convention follow-ups** from the 0.3.0 final review:
   a latent label-clobbering bug in `TryItView`, untested sectioned
   provider paths, a test title claiming coverage it doesn't exercise,
   and an undecided question about `blocks`/`array` settings-nested
   fields.

## Decision — #28 fixed in anker; fieldkit needs no API change

**anker's `Toaster` becomes self-deduplicating.** Rejected:

- *A: fieldkit-only `renderToaster?: boolean` prop* — leaves the bug
  default-on; every host must know to opt out, and every other library
  composing anker reinvents the prop. Treats one call site, not the
  class.
- *C: DOM-sniffing for an existing toast region before mounting* —
  racy with portal timing, couples fieldkit to Chakra DOM internals.

## Changes — anker (3.1.1)

All in `src/primitives/toaster.tsx`.

1. **Closure-scoped mount registry per `createAnkerToaster()` call**
   (the default singleton pair gets one; every custom factory pair gets
   its own, so pairs dedupe independently, per store):
   - Ordered list of mounted instance ids + change listeners.
   - Each mounted `Toaster` registers itself in an effect (cleanup
     unregisters) and subscribes to registry changes.
   - **Only the owner — the first live mount — renders the
     `Portal`/region; all other instances render `null`.**
   - Subscription (not a bare counter) is load-bearing: when the owner
     unmounts, survivors re-render and the next takes over — a host's
     global region keeps working after an editor that mounted first
     unmounts.
   - StrictMode's mount→cleanup→remount is handled by effect symmetry.
     On the server nothing registers; all instances render null.
2. **No API change.** Behavior change is strictly "duplicate regions
   collapse to one" — patch release.
3. **Tests** (`src/primitives/toaster.dedupe.test.tsx`): two mounted
   default `Toaster`s + `toaster.create()` → toast text appears exactly
   once; unmount the owner, create again → still exactly once (survivor
   took over); a custom `createAnkerToaster()` pair dedupes
   independently of the default pair.
4. **Docs:** CHANGELOG 3.1.1 ("multiple mounted `Toaster`s of the same
   pair now render one region; hosts and embedded editors can both
   mount one safely"); one line in CLAUDE-ANKER.md beside the toaster
   entry.

## Changes — fieldkit (0.3.1, after anker 3.1.1 releases)

1. **#28 closure — no code change to SpecEditor.** It keeps mounting
   `<Toaster />`.
   - devDependency `@knkcs/anker` → `^3.1.1`; **peer stays `^3.1.0`**
     (on 3.1.0 hosts simply keep today's duplicate behavior — no hard
     floor; documented).
   - Host-fixture regression test
     (`src/editor/__tests__/toaster-dedupe.test.tsx`): render a global
     `<Toaster />` (the host) PLUS a `SpecEditor`, trigger a real
     editor toast WITHOUT mocking `toaster`, assert the toast text
     renders exactly once.
   - `spec-editor.mdx`: add a note (the mdx has no existing Toaster
     entry — the limitation was tracked only in issue #28): hosts may
     mount their own global `Toaster`; duplicate suppression requires
     anker ≥ 3.1.1.
2. **#31.1 — TryItView label forwarding**: `defaultTab`,
   `searchPlaceholder`, `noResults` get the same conditional-spread
   treatment 0.3.0 gave `optionalMarker`, so explicit-`undefined` keys
   no longer clobber SpecForm's `{ ...DEFAULT_LABELS, ...labels }`
   merge. Test: a TryItView given only the required labels
   (`testSubmit`, `testSubmitSuccess`) over a sectioned schema renders
   SpecForm's defaults (e.g. the "Find field…" search placeholder)
   instead of blank strings.
3. **#31.2 — sectioned-path marker tests**: one renderer test
   (sectioned mostly-required schema → `(optional)` renders inside the
   tabs path) and one editor canvas test (same assertion on a sectioned
   draft). Closes the jsdom gap on the `SpecFormTabs` wrap and the
   canvas sectioned branch (both already runtime-verified in
   Storybook).
4. **#31.3 — resolver test honesty**: add a hidden **group** fixture
   (hidden group with required children) to the hidden-fields test so
   the "(and their children)" title is actually exercised.
5. **#31.4 — blocks/array: documented-by-design.** Block-instance
   counts are data-dependent; a schema-static convention count cannot
   honestly include them, and markers inside block sub-forms follow the
   block's own rendering. The resolver docstring already notes the
   limitation; `validateSpec` gets the matching docstring note. No
   walker learns settings-nested shapes. This closes #31's open
   question.

## Release order

1. anker: implement → merge → tag v3.1.1 (tag-driven CI) → verify npm.
2. fieldkit: devDep bump → implement → merge → 0.3.1 tagged/published.
3. Close #28 and #31 from the fieldkit release.

## Testing summary

- anker: the three dedupe tests above; existing toaster consumers
  unaffected (full gate).
- fieldkit: host-fixture dedupe test; TryItView default-fallback test;
  two sectioned marker tests; hidden-group resolver fixture; full gate.
- Runtime check: Storybook — mount SpecEditor story, trigger an editor
  toast (e.g. field delete → undo toast), confirm a single toast; a
  scratch story/fixture with a host-level Toaster if practical,
  otherwise the jsdom host-fixture test carries the host case.
