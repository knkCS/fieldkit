# Required/Optional Marker Convention — anker FormField markers + SpecForm §10 (fixes anker#146)

**Date:** 2026-07-05
**Status:** Approved design (Approach B of three)
**Ships as:** anker **3.1.0** (minor, flagged visual change) + fieldkit **0.3.0**
**Repos:** ~/repo/anker (lands first), ~/repo/fieldkit

## Problem

anker's design doc (`docs/page-patterns.md` §10) specifies:

> - **Required**: append a small `*` after the label, no extra text.
> - **Optional**: append `(optional)` after the label in muted color.
>
> Don't mark some fields required-with-asterisk and others
> optional-with-text in the same form — pick one and stick with it. Forms
> with mostly-required fields use `(optional)` markers; forms with
> mostly-optional fields use `*` on the few that are required.

None of it is implemented. Chakra v3 never auto-renders a required
indicator — `Field.Label` is a plain wrapper and the `*` only appears if
`Field.RequiredIndicator` is explicitly rendered, which anker's
`FormField` never does. `required` today sets `aria-required` and
nothing visible. fieldkit's `spec-form.mdx` carries this as a Known
Limitation blocked on an `optionalText`-equivalent prop (anker#146).

## Decision — anker hosts the markers AND the form-level convention

`FormField` learns to render both markers; a small context carries the
per-form convention so consumers set it once at the form root.
Explicitly rejected:

- *A: props-only in anker, convention plumbing in fieldkit* — needs a
  fieldkit context + hook anyway, plus a 24-file sweep over every field
  component; custom plugins must each remember to participate, so "one
  convention per form" is enforced by discipline instead of by
  construction.
- *C: extend fieldkit's `FieldProps` plugin contract* — changes public
  plugin API for something a context does invisibly, and still needs
  the 24-component sweep.

Decision (user): the asterisk is **on by default** — every anker form
gains it on update, per §10. Suppression is available per field or per
form.

## Changes — anker (3.1.0)

All in `src/forms/` (single-file core; the 13 field wrappers already
forward unknown props to `FormField` via `...rest`, so no wrapper
edits).

1. **`FormFieldProps` gains two props:**

   ```ts
   /** Appended after the label in muted color when the field is NOT required. */
   optionalText?: React.ReactNode;
   /** When false, suppresses the required asterisk. @default true */
   showRequiredIndicator?: boolean;
   ```

2. **New `src/forms/form-markers.tsx`:** `FormMarkers` interface (the
   two values above), `FormMarkersContext` (default `{}`), exported
   `FormMarkersProvider`. Resolution in `FormField`, per value:
   explicit prop → context → built-in default
   (`showRequiredIndicator: true`, no `optionalText`).

3. **Rendering** — inside the existing string-label `Field.Label`,
   after the label text, before the dirty dot:

   ```tsx
   {resolvedShowIndicator && <Field.RequiredIndicator />}
   {!required && resolvedOptionalText && (
     <Text as="span" color="fg.muted" fontWeight="normal">{resolvedOptionalText}</Text>
   )}
   ```

   `Field.RequiredIndicator` self-hides on non-required fields and is
   styled by the field recipe's `requiredIndicator` slot (theme
   styling for free, `aria-hidden` built in). The `(optional)` text
   stays visible to screen readers — it is informative and lives inside
   the `<label>`. A field never shows both markers (they are gated on
   opposite `required` values).

4. **Non-string labels** (ReactNode) bypass `Field.Label` today and
   keep doing so — markers don't apply; documented beside the same
   limitation the dirty dot already has.

5. **Docs/changelog:** CHANGELOG 3.1.0 flags the visual change
   ("required fields now show `*` by default; suppress via
   `showRequiredIndicator={false}` or `FormMarkersProvider`").
   `CLAUDE-ANKER.md` forms section documents both props + provider.
   `docs/page-patterns.md` §10 gets a one-line pointer to the API.

6. **Tests** (`form-field` tests + a Storybook story): asterisk on
   required; `(optional)` on optional when `optionalText` set; never
   both on one field; `showRequiredIndicator={false}` hides the `*`;
   provider supplies defaults; explicit prop beats provider.

## Changes — fieldkit (0.3.0, after anker 3.1.0 releases)

1. **New `src/schema/marker-convention.ts`** (pure, zero-React):

   ```ts
   export type MarkerConvention = "asterisk" | "optional-text";
   export function resolveMarkerConvention(schema: Schema): MarkerConvention
   ```

   Counts input fields: `section` fields are excluded; group children
   are recursed into (same traversal contract as `validateSpec`), so
   the count matches what renders a label. **Strict majority** of
   required fields (required count > optional count) →
   `"optional-text"`; ties, empty schemas, and
   everything else → `"asterisk"`. An all-required form in
   optional-text mode shows no markers at all — correct, nothing is
   the exception.

2. **SpecForm:** computes the convention from `schema` (memoized) and
   wraps its output in anker's `FormMarkersProvider` —
   `{ showRequiredIndicator: false, optionalText: labels.optionalMarker }`
   in optional-text mode, `{}` in asterisk mode. One provider at the
   form root enforces "one convention per form"; all field components
   (wrapper-based, raw-`FormField`, and custom plugins) inherit it with
   zero component edits. `SpecFormLabels` gains
   `optionalMarker?: string` (default `"(optional)"`). Read mode
   renders no `FormField`s and is unaffected — markers are an
   input-form concern.

3. **Editor:** Try-it mode uses the real SpecForm (covered for free).
   The Build canvas wraps its field previews in the same provider
   computed from the **draft** schema, so toggling "required" in the
   config panel live-flips the preview's convention. `EditorLabels`
   gains the matching `optionalMarker?: string` key (default
   `"(optional)"`; `DEFAULT_EDITOR_LABELS` extended).

4. **Standalone `FieldRenderer`** (no SpecForm): no provider → anker's
   default → asterisks on required fields. §10-correct for the
   mostly-optional case; strictly better than today's nothing.

5. **Peer dependency:** fieldkit imports `FormMarkersProvider` from
   `@knkcs/anker/forms`, which doesn't exist before 3.1 — peer narrows
   from `^2.0.0 || ^3.0.0` to `^3.1.0`; devDependency bumps to match.

6. **Docs:** `spec-form.mdx` — labels-table row for `optionalMarker`,
   convention behavior documented, the Known Limitations entry about
   the missing marker convention removed. `spec-editor.mdx` —
   labels-table row. CLAUDE.md peer-deps section updated to `^3.1.0`.

7. **Tests:** resolver units (strict majority, tie → asterisk,
   sections excluded, group recursion, empty schema). SpecForm
   integration: mostly-required schema → `(optional)` on optional
   labels and no `*` anywhere; mostly-optional → `*` on required
   labels; `optionalMarker` override renders custom text. Editor:
   canvas markers flip when a field's required flag is toggled in the
   draft.

## Release order

1. anker: implement → 3.1.0 released (tag-driven CI).
2. fieldkit: bump devDep/peer to `^3.1.0` → implement → 0.3.0 released.
3. Close anker#146 from the anker release; fieldkit release notes link
   the pair.

## Runtime verification

- anker Storybook: a form with required + optional fields shows `*` by
  default; wrapped in the provider with optional-text mode, the `*`
  disappears and `(optional)` appears muted after optional labels.
- fieldkit Storybook: SpecForm story with a mostly-required schema
  shows `(optional)` markers; a mostly-optional story shows `*`; the
  editor Build canvas flips markers live when toggling required.
