# Fieldkit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical bugs, improve type safety, add error handling, migrate hardcoded colors to semantic tokens, and improve test coverage across all fieldkit layers.

**Architecture:** Five independent workstreams (WS1–WS5) with no cross-dependencies. Each workstream produces a focused commit series. WS1 fixes critical schema/renderer bugs, WS2 tightens type safety, WS3 adds error boundaries and adapter error handling, WS4 swaps hardcoded colors for semantic tokens, WS5 adds tests and standardizes conventions.

**Tech Stack:** TypeScript, React 19, Zod, React Hook Form, Vitest, @knkcs/anker (Chakra UI v3), TanStack Table v8

**Spec:** `docs/superpowers/specs/2026-03-25-fieldkit-hardening-design.md`

**Reference docs to read before starting:**
- `docs/anker-reference.md` — Semantic tokens (lines 320-331), form component APIs
- `docs/react-hook-form-reference.md` — Controller pattern, useFormContext
- `CLAUDE.md` — Project conventions, commands, design principles

**Commands:**
- `npm run test` — Run all tests once
- `npm run typecheck` — TypeScript check
- `npm run lint` — Biome linting
- `npm run lint:write` — Auto-fix lint issues

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/schema/validate-spec.ts` | Spec constraint validation (maxPerSpec) |
| `src/schema/__tests__/validate-spec.test.ts` | Tests for validateSpec |
| `src/renderer/hooks/use-resolved-references.ts` | Shared hook for reference ID resolution + search |
| `src/renderer/field-error-boundary.tsx` | Per-field React error boundary |
| `src/renderer/fields/__tests__/all-fields-smoke.test.tsx` | Parametric smoke test for all 23 field types |
| `src/renderer/fields/__tests__/reference-field.test.tsx` | ReferenceField tests |
| `src/renderer/fields/__tests__/toc-reference-field.test.tsx` | TocReferenceField tests |
| `src/renderer/fields/__tests__/media-field.test.tsx` | MediaField tests |
| `src/renderer/fields/__tests__/blocks-field.test.tsx` | BlocksField tests |
| `src/renderer/fields/__tests__/group-field.test.tsx` | GroupField tests |
| `src/renderer/fields/__tests__/select-field.test.tsx` | SelectField tests |
| `src/table/cells/__tests__/blocks-cell.test.tsx` | BlocksCell tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/schema/zod-builder.ts` | Add hidden field skip + empty-string normalization for optional string fields |
| `src/schema/__tests__/zod-builder.test.ts` | Fix hidden field test assertion |
| `src/schema/field-types/email.ts` | Remove internal required branching and `.or(z.literal(""))` |
| `src/schema/field-types/slug.ts` | Same |
| `src/schema/field-types/url.ts` | Same |
| `src/schema/field-types/rich-text.ts` | `z.any()` → `z.record(z.unknown())` |
| `src/schema/field-types/blocks.ts` | Add `allowed_blocks` validation |
| `src/schema/field-types/boolean.ts` | Add generic type parameter |
| `src/schema/field-types/time.ts` | Add generic type parameter |
| `src/schema/field-types/section.ts` | Add generic type parameter |
| `src/schema/index.ts` | Export `validateSpec` |
| `src/renderer/fields/reference-field.tsx` | Use `useResolvedReferences` hook, add error state |
| `src/renderer/fields/toc-reference-field.tsx` | Same |
| `src/renderer/fields/media-field.tsx` | Add error state to catch blocks |
| `src/renderer/fields/virtual-table-field.tsx` | Add error state to catch blocks |
| `src/renderer/field-component.tsx` | Wrap plugin component in FieldErrorBoundary |
| `src/renderer/context.ts` | Add `onError` to context interface |
| `src/renderer/provider.tsx` | Accept and pass `onError` prop |
| `src/renderer/index.ts` | Export FieldErrorBoundary |
| `src/table/get-cell-for-type.tsx` | Wrap cell in FieldErrorBoundary |
| `src/editor/spec-editor.tsx` | Replace hardcoded colors + wrap fields in error boundary |
| `src/editor/field-modal.tsx` | Replace hardcoded colors |
| `src/editor/type-picker.tsx` | Replace hardcoded colors |
| `src/rich-text-spec/editor-spec-editor.tsx` | Replace hardcoded colors |
| `src/renderer/fields/select-field.tsx` | Fix readOnly on native select |
| `src/renderer/fields/checkboxes-field.tsx` | Fix disabled → readOnly |
| `src/renderer/fields/*.tsx` (all 23) | Standardize prop destructuring pattern |
| `src/table/__tests__/spec-data-table.test.tsx` | Fix 2 failing row click tests |

---

## WS1: Critical Bugs

### Task 1: Fix hidden field exclusion in zod-builder

**Files:**
- Modify: `src/schema/zod-builder.ts:21-22`
- Modify: `src/schema/__tests__/zod-builder.test.ts:79-110`

- [ ] **Step 1: Fix the existing test to assert hidden field is excluded**

In `src/schema/__tests__/zod-builder.test.ts`, replace the test at lines 79-110:

```typescript
it("should skip hidden fields from schema", () => {
	const fields: Field[] = [
		{
			field_type: "text",
			config: {
				name: "Name",
				api_accessor: "name",
				required: true,
				instructions: "",
				hidden: true,
			},
			settings: null,
			children: null,
			system: false,
		},
		{
			field_type: "text",
			config: {
				name: "Title",
				api_accessor: "title",
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		},
	];
	const schema = specToZodSchema(fields, plugins);
	expect(schema.shape).not.toHaveProperty("name");
	expect(schema.shape).toHaveProperty("title");
	// Hidden field should not cause validation failure when omitted
	const result = schema.safeParse({ title: "Mr" });
	expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/schema/__tests__/zod-builder.test.ts`
Expected: FAIL — `name` is still present in schema shape.

- [ ] **Step 3: Add hidden field check to zod-builder**

In `src/schema/zod-builder.ts`, add a continue check after line 22:

```typescript
for (const field of fields) {
	if (STRUCTURAL_TYPES.has(field.field_type)) continue;
	if (field.config.hidden) continue;

	const plugin = pluginMap.get(field.field_type);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/schema/__tests__/zod-builder.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema/zod-builder.ts src/schema/__tests__/zod-builder.test.ts
git commit -m "fix(schema): exclude hidden fields from Zod validation schema"
```

---

### Task 2: Normalize optional field handling (email, slug, url)

**Files:**
- Modify: `src/schema/field-types/email.ts:23-29`
- Modify: `src/schema/field-types/slug.ts:25-38`
- Modify: `src/schema/field-types/url.ts:23-28`
- Modify: `src/schema/zod-builder.ts:29-31`
- Modify: `src/schema/field-types/__tests__/email.test.ts`
- Modify: `src/schema/field-types/__tests__/slug.test.ts`
- Modify: `src/schema/field-types/__tests__/url.test.ts`

- [ ] **Step 1: Update email/slug/url plugin tests for new behavior**

The plugins should always return their base validated type regardless of `required`. The optional+empty-string behavior is now in zod-builder. Replace the optional test case in each test file:

**email.test.ts** — Replace the test that asserts `safeParse("").success` is `true` on the plugin output:
```typescript
it("should always return email-validated string (optional handling delegated to zod-builder)", () => {
	const field = createField({ required: false });
	const zodType = emailPlugin.toZodType(field);
	// Plugin always validates format — empty string fails at plugin level
	expect(zodType.safeParse("valid@email.com").success).toBe(true);
	expect(zodType.safeParse("not-email").success).toBe(false);
	expect(zodType.safeParse("").success).toBe(false); // Changed: empty string now fails
});

it("should allow empty string when optional via specToZodSchema", () => {
	const field = createField({ required: false });
	const schema = specToZodSchema([field], [emailPlugin]);
	expect(schema.safeParse({ [field.config.api_accessor]: "" }).success).toBe(true);
	expect(schema.safeParse({ [field.config.api_accessor]: undefined }).success).toBe(true);
});
```

**slug.test.ts** — Same pattern: plugin-level test expects empty string to fail, integration test via specToZodSchema expects it to pass.

**url.test.ts** — Same pattern.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/schema/field-types/__tests__/email.test.ts`
Expected: FAIL — plugin still has internal branching that allows empty strings.

- [ ] **Step 3: Simplify email plugin toZodType**

Replace `src/schema/field-types/email.ts` lines 23-29 with:

```typescript
toZodType(field: Field<EmailSettings>): ZodTypeAny {
	return z.string().email(`${field.config.name} must be a valid email`);
},
```

- [ ] **Step 4: Simplify slug plugin toZodType**

Replace `src/schema/field-types/slug.ts` lines 25-38 with:

```typescript
toZodType(_field: Field<SlugSettings>): ZodTypeAny {
	return z
		.string()
		.regex(
			SLUG_PATTERN,
			"Must be a valid slug (lowercase letters, numbers, and hyphens)",
		);
},
```

- [ ] **Step 5: Simplify url plugin toZodType**

Replace `src/schema/field-types/url.ts` lines 23-28 with:

```typescript
toZodType(field: Field<UrlSettings>): ZodTypeAny {
	return z.string().url(`${field.config.name} must be a valid URL`);
},
```

- [ ] **Step 6: Add empty-string normalization to zod-builder**

In `src/schema/zod-builder.ts`, replace lines 29-31:

```typescript
if (!field.config.required) {
	zodType = zodType.optional() as ZodTypeAny;
}
```

With:

```typescript
if (!field.config.required) {
	// For string-validated types (email, url, slug), allow empty string
	// so forms can submit with an empty optional field.
	// Note: Zod's .email(), .url(), .regex() return ZodString instances
	// (not ZodEffects), so this check is safe for all current plugins.
	// If a plugin uses .transform()/.refine() on a string, it would
	// return ZodEffects and skip this branch — add handling if needed.
	if (zodType._def.typeName === z.ZodFirstPartyTypeKind.ZodString) {
		zodType = zodType.or(z.literal("")).optional() as ZodTypeAny;
	} else {
		zodType = zodType.optional() as ZodTypeAny;
	}
}
```

- [ ] **Step 7: Run all schema tests**

Run: `npm run test -- src/schema/`
Expected: All tests PASS. Email/slug/url tests may need updates if they tested the old `.or(z.literal(""))` behavior directly on the plugin — adjust test expectations to match the new centralized pattern.

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add src/schema/field-types/email.ts src/schema/field-types/slug.ts src/schema/field-types/url.ts src/schema/zod-builder.ts src/schema/field-types/__tests__/email.test.ts src/schema/field-types/__tests__/slug.test.ts src/schema/field-types/__tests__/url.test.ts
git commit -m "refactor(schema): centralize optional string field handling in zod-builder"
```

---

### Task 3: Extract useResolvedReferences hook

**Files:**
- Create: `src/renderer/hooks/use-resolved-references.ts`
- Modify: `src/renderer/fields/reference-field.tsx`
- Modify: `src/renderer/fields/toc-reference-field.tsx`

- [ ] **Step 1: Create the shared hook**

Create `src/renderer/hooks/use-resolved-references.ts`:

```typescript
import { useCallback, useState } from "react";
import type { FieldKitAdapters } from "../adapters";
import type { ReferenceItem } from "../adapters";

interface UseResolvedReferencesOptions {
	adapter: FieldKitAdapters["reference"];
	blueprints: string[];
}

interface UseResolvedReferencesResult {
	resolved: ReferenceItem[];
	loading: boolean;
	error: string | null;
	search: (query: string) => void;
	searchResults: ReferenceItem[];
	searching: boolean;
	clearSearch: () => void;
	resolveIds: (ids: string[]) => void;
}

export function useResolvedReferences({
	adapter,
	blueprints,
}: UseResolvedReferencesOptions): UseResolvedReferencesResult {
	const [resolved, setResolved] = useState<ReferenceItem[]>([]);
	const [searchResults, setSearchResults] = useState<ReferenceItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [searching, setSearching] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const resolveIds = useCallback(
		async (ids: string[]) => {
			if (!adapter || ids.length === 0) {
				setResolved([]);
				return;
			}
			setLoading(true);
			setError(null);
			try {
				const items = await adapter.fetch(ids);
				setResolved(items);
			} catch (e) {
				console.error("Failed to resolve reference IDs:", e);
				setError("Failed to load references");
			} finally {
				setLoading(false);
			}
		},
		[adapter],
	);

	const search = useCallback(
		async (query: string) => {
			if (!adapter || query.length === 0) {
				setSearchResults([]);
				return;
			}
			setSearching(true);
			setError(null);
			try {
				const results = await adapter.search(blueprints, query);
				setSearchResults(results);
			} catch (e) {
				console.error("Failed to search references:", e);
				setSearchResults([]);
				setError("Search failed");
			} finally {
				setSearching(false);
			}
		},
		[adapter, blueprints],
	);

	const clearSearch = useCallback(() => {
		setSearchResults([]);
	}, []);

	return {
		resolved,
		loading,
		error,
		search,
		searchResults,
		searching,
		clearSearch,
		resolveIds,
	};
}
```

- [ ] **Step 2: Refactor ReferenceField to use the hook**

Rewrite `src/renderer/fields/reference-field.tsx` to:
- Import and call `useResolvedReferences` at the component top level (not inside Controller)
- Import `useWatch` from react-hook-form to read form value at top level
- Use `useEffect` at the component top level to call `resolveIds` when form value changes
- Remove the eslint-disable comments
- Remove the inline `resolveIds`, `handleSearch` useCallbacks
- Controller render function becomes pure rendering using hook state
- Add inline error display when `error` is non-null

Key pattern for the `useEffect` — use JSON.stringify to stabilize the dependency since RHF returns new array refs on each render:

```typescript
const watchedValue = useWatch({ name: accessor, control });
const currentIds: string[] = isSingle
	? watchedValue ? [watchedValue] : []
	: Array.isArray(watchedValue) ? watchedValue : [];
const idsKey = JSON.stringify(currentIds);

useEffect(() => {
	resolveIds(currentIds);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey is the stable dep
}, [idsKey, resolveIds]);
```

The Controller render function then uses `resolved`, `search`, `searchResults`, `searching`, `error`, and `clearSearch` from the hook — all available at the closure scope. No hooks inside render.

- [ ] **Step 3: Refactor TocReferenceField to use the hook**

Same pattern as Step 2. The TocReferenceField is single-select, so:
- `resolveIds` is called with `[currentId]` (single-element array)
- `resolved[0]` is used for display name

```typescript
const watchedValue = useWatch({ name: accessor, control });
const currentId = typeof watchedValue === "string" ? watchedValue : "";

useEffect(() => {
	resolveIds(currentId ? [currentId] : []);
}, [currentId, resolveIds]);
```

- [ ] **Step 4: Run affected tests**

Run: `npm run test -- src/renderer/`
Expected: All existing tests PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hooks/use-resolved-references.ts src/renderer/fields/reference-field.tsx src/renderer/fields/toc-reference-field.tsx
git commit -m "refactor(renderer): extract useResolvedReferences hook to fix Rules of Hooks violation"
```

---

## WS2: Type Safety & Validation

### Task 4: Replace z.any() in rich-text plugin

**Files:**
- Modify: `src/schema/field-types/rich-text.ts:25`
- Modify: `src/schema/field-types/__tests__/rich-text.test.ts`

- [ ] **Step 1: Update test to verify z.record behavior**

Add a test that verifies the schema rejects non-object values (strings, arrays, numbers):

```typescript
it("should reject non-object values", () => {
	const field = createField({ required: true });
	const schema = z.object({ content: richTextPlugin.toZodType(field) });
	expect(schema.safeParse({ content: "plain string" }).success).toBe(false);
	expect(schema.safeParse({ content: 123 }).success).toBe(false);
	expect(schema.safeParse({ content: [1, 2] }).success).toBe(false);
});

it("should accept ProseMirror-like document objects", () => {
	const field = createField({ required: true });
	const schema = z.object({ content: richTextPlugin.toZodType(field) });
	expect(schema.safeParse({ content: { type: "doc", content: [] } }).success).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/schema/field-types/__tests__/rich-text.test.ts`
Expected: FAIL — `z.any()` accepts everything.

- [ ] **Step 3: Replace z.any() with z.record(z.unknown())**

In `src/schema/field-types/rich-text.ts`, replace line 25:

```typescript
toZodType(_field: Field<RichTextSettings>) {
	// Rich text content is stored as JSON (ProseMirror document structure)
	return z.record(z.unknown());
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/schema/field-types/__tests__/rich-text.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema/field-types/rich-text.ts src/schema/field-types/__tests__/rich-text.test.ts
git commit -m "fix(schema): replace z.any() with z.record(z.unknown()) in rich-text plugin"
```

---

### Task 5: Add allowed_blocks validation to blocks plugin

**Files:**
- Modify: `src/schema/field-types/blocks.ts:28-30`
- Modify: `src/schema/field-types/__tests__/blocks.test.ts`

- [ ] **Step 1: Add test for allowed_blocks validation**

```typescript
it("should validate _type against allowed_blocks when defined", () => {
	const field = createField({
		settings: {
			allowed_blocks: [
				{ type: "text", name: "Text", fields: [] },
				{ type: "image", name: "Image", fields: [] },
			],
		},
	});
	const zodType = blocksPlugin.toZodType(field);
	const schema = z.object({ blocks: zodType });

	// Valid block types
	expect(schema.safeParse({ blocks: [{ _type: "text" }, { _type: "image" }] }).success).toBe(true);

	// Invalid block type
	expect(schema.safeParse({ blocks: [{ _type: "video" }] }).success).toBe(false);
});

it("should handle single allowed_block without discriminatedUnion", () => {
	const field = createField({
		settings: {
			allowed_blocks: [{ type: "text", name: "Text", fields: [] }],
		},
	});
	const zodType = blocksPlugin.toZodType(field);
	const schema = z.object({ blocks: zodType });

	expect(schema.safeParse({ blocks: [{ _type: "text" }] }).success).toBe(true);
	expect(schema.safeParse({ blocks: [{ _type: "video" }] }).success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/schema/field-types/__tests__/blocks.test.ts`
Expected: FAIL — current implementation accepts any `_type`.

- [ ] **Step 3: Implement allowed_blocks validation**

Replace `src/schema/field-types/blocks.ts` toZodType (lines 28-30):

```typescript
toZodType(field: Field<BlocksSettings>) {
	const allowedBlocks = field.settings?.allowed_blocks ?? [];

	if (allowedBlocks.length === 0) {
		// No constraints — accept any block with a _type string
		return z.array(z.object({ _type: z.string() }).passthrough());
	}

	if (allowedBlocks.length === 1) {
		// Single block type — use literal match (discriminatedUnion needs 2+)
		return z.array(
			z.object({ _type: z.literal(allowedBlocks[0].type) }).passthrough(),
		);
	}

	// Multiple block types — use discriminatedUnion
	const blockSchemas = allowedBlocks.map((block) =>
		z.object({ _type: z.literal(block.type) }).passthrough(),
	);
	return z.array(
		z.discriminatedUnion("_type", blockSchemas as [typeof blockSchemas[0], typeof blockSchemas[1], ...typeof blockSchemas]),
	);
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/schema/field-types/__tests__/blocks.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema/field-types/blocks.ts src/schema/field-types/__tests__/blocks.test.ts
git commit -m "fix(schema): validate block _type against allowed_blocks in blocks plugin"
```

---

### Task 6: Add validateSpec function and maxPerSpec enforcement

**Files:**
- Create: `src/schema/validate-spec.ts`
- Create: `src/schema/__tests__/validate-spec.test.ts`
- Modify: `src/schema/index.ts`
- Modify: `src/editor/spec-editor.tsx:235-248`

- [ ] **Step 1: Write failing test**

Create `src/schema/__tests__/validate-spec.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";

function mockPlugin(id: string, opts?: { maxPerSpec?: number }): FieldTypePlugin {
	return {
		id,
		name: id,
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => null as never,
		maxPerSpec: opts?.maxPerSpec,
	};
}

function mockField(type: string, accessor: string): Field {
	return {
		field_type: type,
		config: { name: accessor, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		children: null,
		system: false,
	};
}

describe("validateSpec", () => {
	it("should return valid for spec within constraints", () => {
		const plugins = new Map([["text", mockPlugin("text")]]);
		const fields = [mockField("text", "name"), mockField("text", "title")];
		const result = validateSpec(fields, plugins);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("should return error when maxPerSpec is exceeded", () => {
		const plugins = new Map([["toc_reference", mockPlugin("toc_reference", { maxPerSpec: 1 })]]);
		const fields = [
			mockField("toc_reference", "toc1"),
			mockField("toc_reference", "toc2"),
		];
		const result = validateSpec(fields, plugins);
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("toc_reference");
	});

	it("should allow exactly maxPerSpec fields", () => {
		const plugins = new Map([["toc_reference", mockPlugin("toc_reference", { maxPerSpec: 1 })]]);
		const fields = [mockField("toc_reference", "toc1")];
		const result = validateSpec(fields, plugins);
		expect(result.valid).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/schema/__tests__/validate-spec.test.ts`
Expected: FAIL — `validateSpec` does not exist.

- [ ] **Step 3: Implement validateSpec**

Create `src/schema/validate-spec.ts`:

```typescript
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";

export interface SpecValidationResult {
	valid: boolean;
	errors: string[];
}

export function validateSpec(
	fields: Field[],
	plugins: Map<string, FieldTypePlugin>,
): SpecValidationResult {
	const errors: string[] = [];

	// Count fields per type
	const typeCounts = new Map<string, number>();
	for (const field of fields) {
		typeCounts.set(field.field_type, (typeCounts.get(field.field_type) ?? 0) + 1);
	}

	// Check maxPerSpec constraints
	for (const [typeId, count] of typeCounts) {
		const plugin = plugins.get(typeId);
		if (plugin?.maxPerSpec != null && count > plugin.maxPerSpec) {
			errors.push(
				`Field type "${plugin.name}" (${typeId}) is limited to ${plugin.maxPerSpec} per spec, but ${count} were found`,
			);
		}
	}

	return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/schema/__tests__/validate-spec.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Export validateSpec from schema index**

In `src/schema/index.ts`, add:

```typescript
export type { SpecValidationResult } from "./validate-spec";
export { validateSpec } from "./validate-spec";
```

- [ ] **Step 6: Integrate into SpecEditor handleModalSave**

In `src/editor/spec-editor.tsx`, import `validateSpec` and add a validation check inside `handleModalSave` before applying the change. If validation fails, show an alert (or prevent the save) with the first error message.

- [ ] **Step 7: Run full test suite**

Run: `npm run test`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/schema/validate-spec.ts src/schema/__tests__/validate-spec.test.ts src/schema/index.ts src/editor/spec-editor.tsx
git commit -m "feat(schema): add validateSpec function with maxPerSpec enforcement"
```

---

### Task 7: Add missing type annotations to plugins

**Files:**
- Modify: `src/schema/field-types/boolean.ts:8`
- Modify: `src/schema/field-types/time.ts:8`
- Modify: `src/schema/field-types/section.ts:6`

- [ ] **Step 1: Add generic parameter to boolean plugin**

In `src/schema/field-types/boolean.ts` line 8, change:
```typescript
export const booleanPlugin: FieldTypePlugin = {
```
to:
```typescript
export const booleanPlugin: FieldTypePlugin<null> = {
```

Also update `toZodType(_field: Field)` to `toZodType(_field: Field<null>)`. Using `<null>` instead of `<never>` because `zod-builder.ts` casts fields to `Field<unknown>`, and `Field<null>` is assignable where `Field<never>` would cause a type error.

- [ ] **Step 2: Add generic parameter to time plugin**

In `src/schema/field-types/time.ts` line 8, change:
```typescript
export const timePlugin: FieldTypePlugin = {
```
to:
```typescript
export const timePlugin: FieldTypePlugin<null> = {
```

Also update `toZodType(field: Field)` to `toZodType(field: Field<null>)`.

- [ ] **Step 3: Add generic parameter to section plugin**

In `src/schema/field-types/section.ts` line 6, change:
```typescript
export const sectionPlugin: FieldTypePlugin = {
```
to:
```typescript
export const sectionPlugin: FieldTypePlugin<null> = {
```

Also update `toZodType(_field: Field)` to `toZodType(_field: Field<null>)`. Using `<null>` instead of `<never>` because `zod-builder.ts` casts fields to `Field<unknown>`, and `Field<null>` is assignable where `Field<never>` would cause a type error.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/schema/field-types/boolean.ts src/schema/field-types/time.ts src/schema/field-types/section.ts
git commit -m "refactor(schema): add explicit FieldTypePlugin generic to boolean, time, section plugins"
```

---

## WS3: Error Handling & Resilience

### Task 8: Create FieldErrorBoundary component

**Files:**
- Create: `src/renderer/field-error-boundary.tsx`
- Modify: `src/renderer/context.ts:6-10`
- Modify: `src/renderer/provider.tsx:7-11`
- Modify: `src/renderer/field-component.tsx:36-37`
- Modify: `src/table/get-cell-for-type.tsx:35-39`
- Modify: `src/renderer/index.ts`

- [ ] **Step 1: Add onError to context interface**

In `src/renderer/context.ts`, add to `FieldKitContextValue`:

```typescript
export interface FieldKitContextValue {
	getPlugin: (id: string) => FieldTypePlugin | undefined;
	getAllPlugins: () => FieldTypePlugin[];
	adapters: FieldKitAdapters;
	onError?: (error: Error, fieldId: string) => void;
}
```

- [ ] **Step 2: Accept onError in FieldKitProvider**

In `src/renderer/provider.tsx`, add `onError` to props interface and include in context value:

```typescript
export interface FieldKitProviderProps {
	plugins: FieldTypePlugin[];
	adapters?: FieldKitAdapters;
	onError?: (error: Error, fieldId: string) => void;
	children: ReactNode;
}
```

Pass `onError` through in the useMemo value.

- [ ] **Step 3: Create FieldErrorBoundary**

Create `src/renderer/field-error-boundary.tsx`:

```typescript
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	fieldId: string;
	fieldName?: string;
	onError?: (error: Error, fieldId: string) => void;
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class FieldErrorBoundary extends Component<Props, State> {
	static displayName = "FieldErrorBoundary";

	state: State = { hasError: false, error: null };

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, _info: ErrorInfo) {
		this.props.onError?.(error, this.props.fieldId);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div
					role="alert"
					style={{
						padding: "8px 12px",
						fontSize: "14px",
						color: "var(--chakra-colors-fg-muted)",
						border: "1px solid var(--chakra-colors-border)",
						borderRadius: "6px",
						background: "var(--chakra-colors-bg-subtle)",
					}}
				>
					{this.props.fieldName ?? this.props.fieldId}: failed to render
				</div>
			);
		}

		return this.props.children;
	}
}
```

- [ ] **Step 4: Wrap plugin component in field-component.tsx**

In `src/renderer/field-component.tsx`, import `FieldErrorBoundary`. Destructure `onError` from the existing `useFieldKit()` call (don't add a second call):

```typescript
const { getPlugin, onError } = useFieldKit();

// ... existing plugin lookup and hidden check ...

return (
	<FieldErrorBoundary
		fieldId={field.config.api_accessor}
		fieldName={field.config.name}
		onError={onError}
	>
		<Component field={field} readOnly={readOnly || field.config.read_only} />
	</FieldErrorBoundary>
);
```

- [ ] **Step 5: Wrap cell rendering in get-cell-for-type.tsx**

In `src/table/get-cell-for-type.tsx`, import `FieldErrorBoundary` and wrap the cell component (lines 35-39):

```typescript
cell: CellComponent
	? ({ getValue }) => {
			const value = getValue();
			return (
				<FieldErrorBoundary fieldId={field.config.api_accessor}>
					<CellComponent field={field} value={value} />
				</FieldErrorBoundary>
			);
		}
	: ({ getValue }) => {
			const value = getValue();
			return <span>{value != null ? String(value) : ""}</span>;
		},
```

- [ ] **Step 6: Export from renderer index**

In `src/renderer/index.ts`, add:
```typescript
export { FieldErrorBoundary } from "./field-error-boundary";
```

- [ ] **Step 7: Run tests**

Run: `npm run test`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/field-error-boundary.tsx src/renderer/context.ts src/renderer/provider.tsx src/renderer/field-component.tsx src/table/get-cell-for-type.tsx src/renderer/index.ts
git commit -m "feat(renderer): add per-field error boundaries with onError callback"
```

---

### Task 9: Add error handling to adapter-consuming components

**Files:**
- Modify: `src/renderer/fields/media-field.tsx`
- Modify: `src/renderer/fields/virtual-table-field.tsx`

Note: `reference-field.tsx` and `toc-reference-field.tsx` already got error handling in Task 3 via the `useResolvedReferences` hook.

- [ ] **Step 1: Add error state to media-field.tsx**

Replace every empty `catch {}` with:
- `catch (e) { console.error("Media operation failed:", e); setError("Failed to load media"); }`
- Add `const [error, setError] = useState<string | null>(null);`
- Render error inline: `{error && <Text color="fg.error" fontSize="sm">{error}</Text>}`
- Clear error on next user interaction (upload attempt, browse)

- [ ] **Step 2: Add error state to virtual-table-field.tsx**

Same pattern as Step 1.

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/renderer/`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/fields/media-field.tsx src/renderer/fields/virtual-table-field.tsx
git commit -m "fix(renderer): add error logging and user-facing error messages to adapter calls"
```

---

## WS4: Styling Migration

### Task 10: Replace hardcoded colors in spec-editor.tsx

**Files:**
- Modify: `src/editor/spec-editor.tsx`

**Token reference (from `docs/anker-reference.md` lines 320-331):**
- `#ddd`, `#ccc` → `var(--chakra-colors-border)`
- `#f0f4ff`, `#fafafa` → `var(--chakra-colors-bg-subtle)`
- `#333`, `#555`, `#666` → `var(--chakra-colors-fg-default)` or `var(--chakra-colors-fg-muted)`
- `#999`, `#888` → `var(--chakra-colors-fg-subtle)`
- `#e53e3e` → `var(--chakra-colors-red-500)`

- [ ] **Step 1: Replace all hardcoded colors**

Go through each hex value at the line numbers listed below and replace:
- Line 63: `"#ddd"` → `"var(--chakra-colors-border)"`
- Line 65: `"#f0f4ff"` → `"var(--chakra-colors-bg-subtle)"`, `"#fff"` → `"var(--chakra-colors-bg-surface)"`
- Line 90: `"#999"` → `"var(--chakra-colors-fg-subtle)"`
- Line 97: `"#666"` → `"var(--chakra-colors-fg-muted)"`
- Line 107: `"#999"` → `"var(--chakra-colors-fg-subtle)"`
- Line 124: `"#666"` → `"var(--chakra-colors-fg-muted)"`
- Line 142: `"#e53e3e"` → `"var(--chakra-colors-red-500)"`
- Line 292: `"#888"` → `"var(--chakra-colors-fg-subtle)"`
- Line 306: `"#ddd"` → `"var(--chakra-colors-border)"`
- Line 309: `"#fafafa"` → `"var(--chakra-colors-bg-subtle)"`
- Line 331: `"#666"` → `"var(--chakra-colors-fg-muted)"`
- Line 354: `"#ccc"` → `"var(--chakra-colors-border)"`
- Line 356: `"#fff"` → `"var(--chakra-colors-bg-surface)"`
- Line 359: `"#555"` → `"var(--chakra-colors-fg-muted)"`

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/editor/spec-editor.tsx
git commit -m "style(editor): replace hardcoded colors with semantic tokens in spec-editor"
```

---

### Task 11: Replace hardcoded colors in field-modal.tsx

**Files:**
- Modify: `src/editor/field-modal.tsx`

- [ ] **Step 1: Replace all hardcoded colors**

- Line 29: `"#333"` → `"var(--chakra-colors-fg-default)"`
- Line 35: `"#ddd"` → `"var(--chakra-colors-border)"` (in `inputStyle` constant — affects all inputs)
- Line 46: `"#eee"` → `"var(--chakra-colors-border)"`
- Line 47: `"#333"` → `"var(--chakra-colors-fg-default)"`
- Line 228: `"rgba(0, 0, 0, 0.5)"` → `"var(--chakra-colors-black-alpha-500)"`
- Line 246: `"#fff"` → `"var(--chakra-colors-bg-surface)"`
- Line 252: `"rgba(0, 0, 0, 0.15)"` → leave as-is (box shadow rgba is acceptable)
- Line 267: `"#666"` → `"var(--chakra-colors-fg-muted)"`
- Line 316: `"#e53e3e"` → `"var(--chakra-colors-red-500)"` and `"#ddd"` → `"var(--chakra-colors-border)"`
- Line 323: `"#e53e3e"` → `"var(--chakra-colors-red-500)"`
- Line 506: `"#eee"` → `"var(--chakra-colors-border)"`
- Line 514: `"#ddd"` → `"var(--chakra-colors-border)"`
- Line 516: `"#fff"` → `"var(--chakra-colors-bg-surface)"`
- Line 532: `"#2563eb"` → `"var(--chakra-colors-accent)"`, `"#93c5fd"` → `"var(--chakra-colors-blue-200)"`
- Line 533: `"#fff"` → `"var(--chakra-colors-bg-surface)"` (save button text)

- [ ] **Step 2: Commit**

```bash
git add src/editor/field-modal.tsx
git commit -m "style(editor): replace hardcoded colors with semantic tokens in field-modal"
```

---

### Task 12: Replace hardcoded colors in type-picker.tsx and editor-spec-editor.tsx

**Files:**
- Modify: `src/editor/type-picker.tsx`
- Modify: `src/rich-text-spec/editor-spec-editor.tsx`

- [ ] **Step 1: Replace in type-picker.tsx**

- Line 82: `"#888"` → `"var(--chakra-colors-fg-subtle)"`
- Line 95: `"#ddd"` → `"var(--chakra-colors-border)"`
- Line 112: `"#666"` → `"var(--chakra-colors-fg-muted)"`
- Line 142: `"#ddd"` → `"var(--chakra-colors-border)"`
- Line 144: `"#f5f5f5"` → `"var(--chakra-colors-bg-subtle)"`, `"#fff"` → `"var(--chakra-colors-bg-surface)"`
- Line 164: `"#666"` → `"var(--chakra-colors-fg-muted)"`
- Line 176: `"#888"` → `"var(--chakra-colors-fg-subtle)"`

- [ ] **Step 2: Replace in editor-spec-editor.tsx**

- Line 73: `"#e2e8f0"` → `"var(--chakra-colors-border)"`
- Line 77: `"#f7fafc"` → `"var(--chakra-colors-bg-subtle)"`, `"#fff"` → `"var(--chakra-colors-bg-surface)"` (both sides of ternary)
- Line 106: `"#718096"` → `"var(--chakra-colors-fg-subtle)"`
- Line 119: `"#a0aec0"` → `"var(--chakra-colors-fg-subtle)"`
- Line 135: `"#718096"` → `"var(--chakra-colors-fg-subtle)"`
- Line 150: `"#e2e8f0"` → `"var(--chakra-colors-border)"`
- Line 191: `"#e2e8f0"` → `"var(--chakra-colors-border)"`
- Line 285: `"#718096"` → `"var(--chakra-colors-fg-subtle)"`

- [ ] **Step 3: Run lint and visual check**

Run: `npm run lint`
Run: `npm run dev` — visually verify in Storybook that SpecEditor and EditorSpecEditor stories render correctly.

- [ ] **Step 4: Commit**

```bash
git add src/editor/type-picker.tsx src/rich-text-spec/editor-spec-editor.tsx
git commit -m "style(editor): replace hardcoded colors with semantic tokens in type-picker and editor-spec-editor"
```

---

## WS5: Test Coverage & Conventions

### Task 13: Fix 2 failing tests in spec-data-table

**Files:**
- Modify: `src/table/__tests__/spec-data-table.test.tsx`

- [ ] **Step 1: Investigate the failures**

Run: `npm run test -- src/table/__tests__/spec-data-table.test.tsx`

Read the error output. The failures are likely "Unable to fire a click event — please provide a DOM element" from `fireEvent.click` on row elements. Investigate whether `screen.getAllByRole("row")` returns proper DOM elements in jsdom.

- [ ] **Step 2: Fix the tests**

The issue is likely that the row elements need a more specific selector or the click handler needs to target the `<tr>` element directly. Fix by using `userEvent.click` or a more targeted query.

- [ ] **Step 3: Run tests to verify fix**

Run: `npm run test -- src/table/__tests__/spec-data-table.test.tsx`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/table/__tests__/spec-data-table.test.tsx
git commit -m "fix(table): fix failing row click tests in spec-data-table"
```

---

### Task 14: Fix readOnly/disabled in SelectField and CheckboxesField

**Files:**
- Modify: `src/renderer/fields/select-field.tsx:25-27`
- Modify: `src/renderer/fields/checkboxes-field.tsx:29`

- [ ] **Step 1: Fix native select readOnly in SelectField**

In `src/renderer/fields/select-field.tsx`, the native `<select>` doesn't support `readOnly`. Replace lines 25-27:

```typescript
<select
	multiple
	disabled={readOnly}
	style={readOnly ? { pointerEvents: "none", opacity: 0.6 } : undefined}
	value={Array.isArray(formField.value) ? formField.value : []}
```

- [ ] **Step 2: Fix CheckboxesField**

In `src/renderer/fields/checkboxes-field.tsx` line 29, change:
```typescript
disabled={readOnly}
```
to:
```typescript
readOnly={readOnly}
```

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm run test -- src/renderer/`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/fields/select-field.tsx src/renderer/fields/checkboxes-field.tsx
git commit -m "fix(renderer): use readOnly instead of disabled in SelectField and CheckboxesField"
```

---

### Task 15: Standardize prop destructuring across all field components

**Files:**
- Modify: all 23 files in `src/renderer/fields/*.tsx`

- [ ] **Step 1: Establish the pattern**

Every field component should use this destructuring at the top:

```typescript
export function XxxField({ field, readOnly }: FieldProps<XxxSettings>) {
	const { config, settings } = field;
	// For fields with settings that need defaults:
	const { optionA = defaultA, optionB = defaultB } = settings ?? {};
```

- [ ] **Step 2: Apply to all 23 field components**

Go through each file. Most already follow this pattern or close to it. The main fixes are:
- Components that use `field.settings ?? { options: {} }` — normalize to `const { options = {} } = settings ?? {};`
- Components that access `field.config` inline — use `config` destructure
- Components that use `field.settings?.xxx` with optional chaining — use destructured `settings`

This is mechanical — same pattern applied everywhere.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests PASS. This is purely structural — no behavior change.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/fields/
git commit -m "refactor(renderer): standardize prop destructuring across all field components"
```

---

### Task 16: Add complex field component tests

**Files:**
- Create: `src/renderer/fields/__tests__/reference-field.test.tsx`
- Create: `src/renderer/fields/__tests__/toc-reference-field.test.tsx`
- Create: `src/renderer/fields/__tests__/media-field.test.tsx`
- Create: `src/renderer/fields/__tests__/blocks-field.test.tsx`
- Create: `src/renderer/fields/__tests__/group-field.test.tsx`
- Create: `src/renderer/fields/__tests__/select-field.test.tsx`
- Create: `src/table/cells/__tests__/blocks-cell.test.tsx`

- [ ] **Step 1: Create test helpers**

Before writing individual tests, check if a shared test helper exists in `src/renderer/fields/__tests__/`. If not, create a small helper that wraps a field in the required providers (`FormProvider` + `FieldKitProvider`). Reference the existing `text-field.test.tsx` for the pattern.

- [ ] **Step 2: Write SelectField tests**

Test cases:
- Renders single select with options
- Renders multi select with options
- readOnly disables interaction
- Handles empty options
- Handles value changes

- [ ] **Step 3: Write ReferenceField tests**

Test cases:
- Renders "adapter not configured" when no adapter
- Renders search input when adapter is available
- Calls adapter.fetch on mount with existing value
- Displays resolved display names
- Handles search and selection
- readOnly hides search input
- Shows error message on adapter failure

- [ ] **Step 4: Write TocReferenceField tests**

Similar to ReferenceField but single-select specific:
- Single item display
- Clear button
- Search only shows when no item selected

- [ ] **Step 5: Write MediaField tests**

Test cases:
- Renders "adapter not configured" fallback
- Renders upload area
- readOnly behavior
- Error state on upload failure

- [ ] **Step 6: Write BlocksField tests**

Test cases:
- Renders existing blocks
- Add/remove block buttons
- Move block up/down
- readOnly hides controls
- Empty state

- [ ] **Step 7: Write GroupField tests**

Test cases:
- Renders nested fields via FieldRenderer
- Add/remove rows
- readOnly behavior
- Max items enforcement

- [ ] **Step 8: Write BlocksCell test**

Create `src/table/cells/__tests__/blocks-cell.test.tsx`:

Test cases:
- Renders "N blocks" count correctly
- Shows top 3 block types in preview
- Shows "+N more" when >3 block types
- Handles null/empty value
- Singular "1 block" vs plural "2 blocks"

- [ ] **Step 9: Run all tests**

Run: `npm run test`
Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/fields/__tests__/ src/table/cells/__tests__/blocks-cell.test.tsx
git commit -m "test(renderer): add comprehensive tests for complex field components and BlocksCell"
```

---

### Task 17: Add parametric smoke test for all field types

**Files:**
- Create: `src/renderer/fields/__tests__/all-fields-smoke.test.tsx`

- [ ] **Step 1: Write the parametric smoke test**

```typescript
import { render } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";

function Wrapper({ children }: { children: React.ReactNode }) {
	const methods = useForm({ defaultValues: {} });
	return (
		<FieldKitProvider plugins={builtInFieldTypes}>
			<FormProvider {...methods}>{children}</FormProvider>
		</FieldKitProvider>
	);
}

const fieldTypes = builtInFieldTypes
	.filter((p) => p.id !== "section") // Section renders null — tested separately
	.map((p) => p.id);

describe.each(fieldTypes)("Field type: %s", (fieldType) => {
	it("should render without crashing", () => {
		const field: Field = {
			field_type: fieldType,
			config: {
				name: `Test ${fieldType}`,
				api_accessor: `test_${fieldType}`,
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};

		const { container } = render(
			<Wrapper>
				<FieldComponent field={field} />
			</Wrapper>,
		);
		expect(container).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run the smoke test**

Run: `npm run test -- src/renderer/fields/__tests__/all-fields-smoke.test.tsx`
Expected: All field types render without crashing.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/fields/__tests__/all-fields-smoke.test.tsx
git commit -m "test(renderer): add parametric smoke test for all 23 field types"
```

---

### Task 18: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 4: Visual check in Storybook**

Run: `npm run dev`
Verify in browser:
- SpecEditor story renders with correct colors
- Field modal opens with correct styling
- EditorSpecEditor toggles work
- All field type stories render correctly

---

## Task Summary

| Task | WS | Description | Key Files |
|------|----|----|-----------|
| 1 | WS1 | Fix hidden field exclusion | zod-builder.ts |
| 2 | WS1 | Normalize optional field handling | email.ts, slug.ts, url.ts, zod-builder.ts |
| 3 | WS1 | Extract useResolvedReferences hook | use-resolved-references.ts, reference-field.tsx, toc-reference-field.tsx |
| 4 | WS2 | Replace z.any() in rich-text | rich-text.ts |
| 5 | WS2 | Add allowed_blocks validation | blocks.ts |
| 6 | WS2 | Add validateSpec + maxPerSpec | validate-spec.ts, spec-editor.tsx |
| 7 | WS2 | Fix plugin type annotations | boolean.ts, time.ts, section.ts |
| 8 | WS3 | Create FieldErrorBoundary | field-error-boundary.tsx, field-component.tsx, get-cell-for-type.tsx |
| 9 | WS3 | Add adapter error handling | media-field.tsx, virtual-table-field.tsx |
| 10 | WS4 | Token swap: spec-editor | spec-editor.tsx |
| 11 | WS4 | Token swap: field-modal | field-modal.tsx |
| 12 | WS4 | Token swap: type-picker + editor-spec-editor | type-picker.tsx, editor-spec-editor.tsx |
| 13 | WS5 | Fix 2 failing tests | spec-data-table.test.tsx |
| 14 | WS5 | Fix readOnly/disabled | select-field.tsx, checkboxes-field.tsx |
| 15 | WS5 | Standardize prop patterns | all 23 field components |
| 16 | WS5 | Complex field component tests | 7 new test files |
| 17 | WS5 | Parametric smoke test | all-fields-smoke.test.tsx |
| 18 | — | Final verification | — |
