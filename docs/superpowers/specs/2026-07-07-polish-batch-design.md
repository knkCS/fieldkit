# Polish Batch — read-mode fallback, editor minors, test fixtures (fixes #26, #30, #34)

**Date:** 2026-07-07
**Status:** Approved design
**Ships as:** fieldkit **0.4.2** (fieldkit-only; additive labels only)

## Scope

The three remaining polish issues, one branch, one release. One #30 item
("TryItView label spread") was already fixed structurally by 0.4.0's
`mergeLabels` — it is verified (the existing TryItView fallback test is
the pin) and ticked, not re-implemented. The anker `name`-attribute
question from #34 is out of scope — filed as an anker issue instead.

## Decisions (user-approved)

- **#26 fallback: type-aware formatting with translatable labels**, not
  document-only — raw `String(value)` output (`true`, `[object Object]`)
  is the off-system feel the redesign eliminated. Formatting is the
  safety net; `cellComponent` remains the API for full control (mdx
  states this).
- **#30 `onDirtyChange`: call-latest ref pattern** in `useSpecDraft`,
  not a memoization docs note — removes the consumer burden instead of
  documenting a footgun.

## Changes

### A. #26 — read mode + jump

1. `src/renderer/spec-form/read-tab.tsx` fallback (`ReadValue`'s
   cell-less path): booleans render `labels.booleanYes`/`booleanNo`
   (new `SpecFormLabels` keys, defaults `"Yes"`/`"No"`; threaded to
   ReadTab which currently takes no labels — plumb the two strings or
   the resolved labels object through, matching existing prop style);
   arrays of primitives join with `", "`; plain objects and
   arrays-of-objects render the existing em-dash empty convention;
   numbers/strings unchanged. `spec-form.mdx`: labels rows + a note
   that custom non-string types should ship a `cellComponent`.
2. `FOCUSABLE_SELECTOR` (`spec-form.tsx:25`) skips disabled controls:
   `input:not(:disabled), textarea:not(:disabled),
   select:not(:disabled), button:not(:disabled), [tabindex]` — a
   disabled control matched by the jump fallback no-ops on `.focus()`.

### B. #30 — editor minors (open items)

1. **Delete-undo restores panel selection** of the restored field
   (SpecEditor's undo handler selects the restored accessor after
   re-inserting).
2. **Discard bumps the Try-it remount nonce** so stale scratch values
   can't persist against the reset draft.
3. **Committed-accessor disconnect warning survives deselect/reselect
   mid-rename**: the sync baseline re-derives from the COMMITTED
   schema, not the draft, on selection (exact ref located at plan
   time; the symptom is the warning vanishing after reselect).
4. **Accessor trim**: `validateAccessor`'s collision path trims, so a
   trailing-whitespace accessor can't slip into the draft on
   blur-in-error-state.
5. **`moveField(schema, i, i)` returns the SAME reference** (no-op
   contract, matching the other draft-ops no-op paths).
6. **`FieldShell` gains `data-invalid`** when invalid; the existing
   danger-outline test pins the attribute exactly instead of relative
   border comparison.
7. **userEvent blur-ordering regression test** for rename
   commit-on-blur (tab switch / + Section during rename rely on native
   focus semantics that fireEvent doesn't emulate). Adds
   `@testing-library/user-event` as a devDependency — the repo's
   fireEvent-only convention stands elsewhere; this is the one case
   that NEEDS real focus traversal.
8. **`onDirtyChange` call-latest ref** in `use-spec-draft.ts` (effect
   depends only on `dirty`); mdx note removed/updated accordingly.
9. Already done, verify + tick: getDefaultValues hoist (C5),
   blocks-field probe (C1, shared NestedItemFields), TryItView label
   spread (0.4.0 mergeLabels).
10. **The 4 pre-existing lint warnings** (carried in session ledgers
   alongside #30): `noArrayIndexKey` in
   `src/renderer/fields/virtual-table-field.tsx` and
   `noLabelWithoutControl` in `src/rich-text-spec/editor-spec-editor.tsx`
   + two table test files — fix each properly (stable keys; associate
   or re-role the labels), no suppressions unless a finding is a
   genuine false positive (justify in-code if so).

### C. #34 — fixtures + nesting fix

1. **Two-instance scoping fixture**: two read-mode SpecForms with the
   same accessor mounted together; jumping in one flashes ONLY that
   instance's row.
2. **Quote-accessor escape fixture**: an accessor containing `"`
   jumps successfully — the one case where `CSS.escape` in the quoted
   selector is observably load-bearing.
3. **div-in-p fix**: the `data-field-row` wrapper in `read-tab.tsx`
   becomes `Box as="span" display="block"` — kills the React DOM
   nesting warning (`DescriptionList.Row` renders its value inside a
   `<p>`). Layout unchanged (block display).
4. anker inputs missing `name` (edit-jump tier-1 dead): file an anker
   issue; no fieldkit change.

## Testing

- #26: fallback units per type (boolean via labels + override, primitive
  array join, object/array-of-objects em dash, string/number
  passthrough) with a cell-less custom plugin fixture; a
  `:disabled`-first fixture proving the jump focuses the next
  focusable.
- #30: one test per behavior item (undo→selection, discard→nonce via
  scratch-value reset, reselect→warning persists, trim, same-ref
  moveField, data-invalid pin, userEvent blur-ordering); the ref
  pattern gets an unmemoized-callback test (effect does not refire on
  identity-only changes).
- #34: the two fixtures above; the nesting fix is pinned by asserting
  no `validateDOMNesting`-style console error on a read-mode render
  (or simply by the wrapper's rendered tag).
- Full gates; existing suites stay green.
- Runtime pass (Storybook): read-mode story shows formatted booleans;
  editor story — delete → undo → panel shows the restored field;
  discard from Try-it resets scratch values.

## Release

fieldkit 0.4.2 via tag-driven CI after merge + final review; close
#26, #30, #34; file the anker `name`-attr issue.
