# Fieldkit Hardening — Design Spec

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Critical bug fixes, type safety, error handling, styling migration, test coverage & conventions

## Context

A full repo review of @knkcs/fieldkit identified 12 issues across all five layers (schema, renderer, table, editor, rich-text-spec). The issues range from critical bugs (hidden field validation, React hooks violations) to consistency gaps (hardcoded colors, missing tests, inconsistent prop patterns).

The project is well-structured overall — 25 field types, each with plugin + renderer + cell + story + docs + tests. Build config, CI, and documentation are solid. The issues below are the gaps that need closing before the library is production-hardened.

## Approach

Five independent workstreams grouped by cross-cutting concern. Each workstream produces a focused, reviewable PR with no cross-dependencies.

## WS1: Critical Bugs

### 1.1 Hidden Field Exclusion

**Problem:** `zod-builder.ts` never checks `field.config.hidden`. Hidden fields are included in the validation schema. The existing test (`zod-builder.test.ts`) only asserts parsing succeeds — it does not verify the hidden field key is absent from the schema shape.

**Fix:**
- Add `if (field.config.hidden) continue;` to the field loop in `specToZodSchema()` in `src/schema/zod-builder.ts`
- Fix the test to assert `expect(schema.shape).not.toHaveProperty("hiddenFieldAccessor")`

### 1.2 `useResolvedReferences` Hook

**Problem:** `reference-field.tsx` and `toc-reference-field.tsx` both call `useEffect` inside Controller's render function, violating React's Rules of Hooks (acknowledged via eslint-disable comments). This will break with React Compiler or concurrent features.

**Fix:**
- Create `src/renderer/hooks/use-resolved-references.ts`
- Hook signature: `useResolvedReferences(ids: string[], adapter: ReferenceAdapter, blueprints: string[])`
- Returns: `{ resolved: ResolvedReference[], loading: boolean, search: (query: string) => void, searchResults: SearchResult[] }`
- Both `ReferenceField` and `TocReferenceField` call the hook above Controller, passing resolved data into the render function
- Controller's render function becomes pure rendering — no hooks inside

### 1.3 Optional Field Normalization

**Problem:** `email.ts`, `slug.ts`, `url.ts` use `.or(z.literal(""))` inside the plugin, while all other plugins rely on `zod-builder.ts` to apply `.optional()`. This creates inconsistent double-wrapping (`union.optional()`) for these three types.

**Fix:**
- Remove `.or(z.literal(""))` from `email.ts`, `slug.ts`, `url.ts` — plugins return the base validated type only
- In `zod-builder.ts`, when `validation.required` is false and the Zod type is a string-based type, wrap with `.or(z.literal("")).optional()` — one place, one pattern
- Update tests to verify the normalized behavior

## WS2: Type Safety & Validation

### 2.1 Rich Text Validation

**Problem:** `rich-text.ts` uses `z.any()`, bypassing all validation.

**Fix:** Replace with `z.record(z.unknown())`. ProseMirror documents are always objects — this prevents primitives/arrays while staying flexible for the JSON structure.

### 2.2 Blocks Validation

**Problem:** `blocks.ts` uses `.passthrough()` without checking against `allowed_blocks` from settings.

**Fix:** When `settings.allowed_blocks` is defined, generate `z.array(z.discriminatedUnion("_type", [...]))` with one entry per allowed block type (each using `.passthrough()`). When no constraint exists, keep current `z.array(z.object({ _type: z.string() }).passthrough())` behavior.

### 2.3 `maxPerSpec` Enforcement

**Problem:** `toc-reference.ts` declares `maxPerSpec: 1` but nothing enforces it at runtime.

**Fix:**
- Create `src/schema/validate-spec.ts` with `validateSpec(fields: Field[], plugins: Map)` function
- Checks constraints: `maxPerSpec` counts per field type
- Call from `SpecEditor` on field add/save
- `TypePicker` already disables types at the limit — this adds the runtime safety net
- Returns validation result with errors, not throws

### 2.4 Missing Type Annotations

**Problem:** `booleanPlugin`, `timePlugin`, `sectionPlugin` lack explicit `FieldTypePlugin` generic parameter.

**Fix:** Add the generic parameter to all three. Minimal diff.

## WS3: Error Handling & Resilience

### 3.1 Per-Field Error Boundary

**Problem:** No error boundaries anywhere. A single broken plugin crashes the entire form/table/editor.

**Fix:**
- Create `src/renderer/field-error-boundary.tsx` — a React error boundary component
- Fallback: subtle inline error state showing field name + "failed to render" using anker semantic tokens
- Wrap each field in `FieldComponent` dispatch
- Wrap each cell in `getCellForFieldType`
- Wrap each field in `SpecEditor`'s field list
- Expose optional `onError?: (error: Error, fieldId: string) => void` callback via `FieldKitProvider` for consumer logging

### 3.2 Adapter Error Handling

**Problem:** `media-field`, `reference-field`, `toc-reference-field`, `virtual-table-field` all have empty `catch {}` blocks. No logging, no user feedback, no recovery path.

**Fix per adapter-consuming component:**
- Add `console.error(error)` for debugging
- Add local `useState<string | null>` for error message
- Render inline error message (e.g. "Failed to load references") using anker semantic tokens
- User retries naturally by interacting again (search, upload, etc.)
- No retry/backoff machinery — keep it simple

## WS4: Styling Migration

**Scope:** Token swap only. No structural changes, no migration to Chakra `sx` prop.

### Files

- `src/editor/spec-editor.tsx` — ~15 hardcoded color values
- `src/editor/field-modal.tsx` — ~12 hardcoded color values
- `src/rich-text-spec/editor-spec-editor.tsx` — ~6 hardcoded color values

### Token Mapping

| Hardcoded | Semantic Token |
|-----------|---------------|
| `#ddd`, `#ccc`, `#e2e8f0` | `border.subtle` / `border.muted` |
| `#f0f4ff`, `#fafafa`, `#f7fafc` | `bg.subtle` / `bg.muted` |
| `#333`, `#555`, `#666` | `fg.default` / `fg.muted` |
| `#999`, `#888`, `#718096`, `#a0aec0` | `fg.subtle` |
| `#e53e3e` | `fg.error` |
| `#2563eb`, `#93c5fd` | `colorPalette.solid` / `colorPalette.muted` |
| `rgba(0,0,0,0.5)` | `bg.overlay` |
| `#fff` | `bg.panel` |

Exact token names to be verified against `docs/anker-reference.md` during implementation. Inline `style={{}}` stays — values are swapped to `var(--chakra-colors-<token>)`.

## WS5: Test Coverage & Conventions

### 5.1 Complex Field Tests

New test files (~7) for components with real logic:
- `reference-field.test.tsx`
- `toc-reference-field.test.tsx`
- `media-field.test.tsx`
- `blocks-field.test.tsx`
- `group-field.test.tsx`
- `select-field.test.tsx`
- `blocks-cell.test.tsx`

Each tests: rendering, adapter interactions (with mocks), error states, readOnly behavior, edge cases (empty arrays, null values, missing adapters).

### 5.2 Parametric Smoke Test

New file: `src/renderer/fields/__tests__/all-fields-smoke.test.tsx`

Single `it.each` block iterating over all 23 field types. Each iteration renders the field with minimal valid props inside `FormProvider` + `FieldKitProvider`, asserts no crash and component mounts.

### 5.3 `readOnly` / `disabled` Fix

- `SelectField`: change native `<select>`'s `disabled={readOnly}` to `readOnly={readOnly}`
- `CheckboxesField`: change `disabled={readOnly}` to `readOnly={readOnly}`
- Covered by new tests from 5.1

### 5.4 Prop Pattern Standardization

Establish one convention across all 23 field components:
- Destructure `field` into `{ config, settings }` at the top of the component
- Use nullish coalesce for settings with defaults: `const { options = {} } = settings ?? {}`
- Apply consistently across all field components

### 5.5 Fix Failing Tests

Investigate and fix the 2 failing row click tests in `src/table/__tests__/spec-data-table.test.tsx`.

## Workstream Dependencies

None. All five workstreams are independent and can be executed in parallel. Recommended execution order if sequential:

1. **WS1** (Critical Bugs) — highest impact, unblocks confidence in schema layer
2. **WS2** (Type Safety) — builds on schema layer understanding from WS1
3. **WS3** (Error Handling) — new components, no conflicts with other WSs
4. **WS5** (Tests & Conventions) — validates all changes, catches regressions
5. **WS4** (Styling) — lowest risk, purely visual

## Out of Scope

- Full editor migration to anker components (deferred — token swap only)
- Server-side pagination for SpecDataTable
- Rich-text ProseMirror document schema validation (beyond `z.record()`)
- Section field redesign (current approach is functional)
- Retry/backoff for adapter calls
