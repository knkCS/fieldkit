# Value-Defaults Bundle (#38 + #37 + #36) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fieldkit 0.7.0 — plugin-contract value defaults in `getDefaultValues` (#38), "empty or valid" optional strings (#38), key-order-insensitive draft echo compare (#37), saveFailed toast description (#36).

**Architecture:** Three independent slices behind one release. #38 adds an optional `defaultValue` function to `FieldTypePlugin` and a `plugins?` param to `getDefaultValues`; #37 swaps `JSON.stringify` equality in `use-spec-draft` for a module-private `deepEqual`; #36 adds a `formatSaveError` prop to SpecEditor.

**Tech Stack:** TypeScript, Zod 3, React 19, Vitest + @testing-library/react (jsdom), Biome.

**Spec:** `docs/superpowers/specs/2026-07-09-value-defaults-bundle-design.md` (approved). Branch: `feat/value-defaults-bundle`.

## Global Constraints

- All work on branch `feat/value-defaults-bundle`; never commit to main.
- Conventional Commits, subject < 72 chars, scopes here: `schema`, `editor`, `table`, or none.
- `npm run typecheck` && `npm run lint` must be green before every commit; `npm run test` before finishing a task.
- No new public export for `deepEqual` (editor-internal). Everything else keeps existing subpath export structure.
- **Spec refinement (locked during planning):** `defaultValue` is ALWAYS a function `(field: Field<S>) => unknown` — never a bare value. Rationale: `unknown | fn` collapses to `unknown` in TS (no signature hint), and the function form guarantees fresh array/object instances per call (no shared mutable defaults across forms).
- The release tag/publish is NOT part of this plan — package.json bump yes, tag push only after explicit user OK.

---

### Task 1: `deepEqual` editor util (#37, part 1)

**Files:**
- Create: `src/editor/deep-equal.ts`
- Test: `src/editor/__tests__/deep-equal.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `deepEqual(a: unknown, b: unknown): boolean` — objects key-order-insensitive with `undefined`-valued keys treated as absent; arrays order-sensitive; primitives via `Object.is`. Task 2 imports it from `../deep-equal`.

- [ ] **Step 1: Write the failing test**

```ts
// src/editor/__tests__/deep-equal.test.ts
import { describe, expect, it } from "vitest";
import { deepEqual } from "../deep-equal";

describe("deepEqual", () => {
	it("compares primitives with Object.is semantics", () => {
		expect(deepEqual(1, 1)).toBe(true);
		expect(deepEqual("a", "b")).toBe(false);
		expect(deepEqual(null, null)).toBe(true);
		expect(deepEqual(null, undefined)).toBe(false);
		expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
	});

	it("is key-order-insensitive for objects, recursively", () => {
		const a = { x: 1, y: { p: "a", q: [1, 2] }, z: null };
		const b = { z: null, y: { q: [1, 2], p: "a" }, x: 1 };
		expect(deepEqual(a, b)).toBe(true);
	});

	it("is order-SENSITIVE for arrays (field order is meaning)", () => {
		expect(deepEqual([1, 2], [2, 1])).toBe(false);
		expect(deepEqual([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 2 }])).toBe(true);
	});

	it("treats undefined-valued keys as absent (JSON round-trip parity)", () => {
		expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
		expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
		expect(deepEqual({ a: undefined }, { a: null })).toBe(false);
	});

	it("distinguishes object/array/primitive mismatches", () => {
		expect(deepEqual({}, [])).toBe(false);
		expect(deepEqual({ a: 1 }, null)).toBe(false);
		expect(deepEqual([1], { 0: 1 })).toBe(false);
		expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/__tests__/deep-equal.test.ts`
Expected: FAIL — cannot resolve `../deep-equal`.

- [ ] **Step 3: Write the implementation**

```ts
// src/editor/deep-equal.ts
/**
 * Key-order-insensitive deep equality for JSON-shaped values (#37).
 * Postgres jsonb re-orders object keys on read-back, so the draft
 * baseline/echo comparison must not depend on key order. Arrays stay
 * order-sensitive (field order is meaning). `undefined`-valued keys are
 * treated as absent — parity with JSON.stringify/jsonb round-trips, which
 * drop them. Editor-internal; not a public export.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false;
		}
		return a.every((item, i) => deepEqual(item, b[i]));
	}
	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a === null ||
		b === null
	) {
		return false;
	}
	const ra = a as Record<string, unknown>;
	const rb = b as Record<string, unknown>;
	const keysA = Object.keys(ra).filter((k) => ra[k] !== undefined);
	const keysB = Object.keys(rb).filter((k) => rb[k] !== undefined);
	if (keysA.length !== keysB.length) return false;
	return keysA.every((k) => rb[k] !== undefined && deepEqual(ra[k], rb[k]));
}
```

Note the last line: `rb[k] !== undefined` (not `k in rb`) keeps the
undefined-as-absent rule symmetric.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor/__tests__/deep-equal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/deep-equal.ts src/editor/__tests__/deep-equal.test.ts
git commit -m "feat(editor): key-order-insensitive deepEqual util (#37)"
```

---

### Task 2: use-spec-draft adopts deepEqual (#37, part 2)

**Files:**
- Modify: `src/editor/use-spec-draft.ts:74-93` (baselineJson memo + reset-guard effect)
- Test: `src/editor/__tests__/use-spec-draft.test.tsx` (add cases; read the file first and reuse its existing renderHook harness and schema fixtures)

**Interfaces:**
- Consumes: `deepEqual` from `../deep-equal` (Task 1).
- Produces: no signature change — `useSpecDraft` behavior only.

- [ ] **Step 1: Write the failing tests**

Add to `src/editor/__tests__/use-spec-draft.test.tsx`, following the file's existing harness (it already renders the hook with a schema fixture and rerenders with new props). Add this key-reorder helper next to the existing fixtures:

```ts
/** Recursively rebuilds objects with reversed key order — simulates a
 * Postgres jsonb round-trip, which preserves content but not key order. */
function reorderKeys<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(reorderKeys) as unknown as T;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		return Object.fromEntries(
			entries.reverse().map(([k, v]) => [k, reorderKeys(v)]),
		) as T;
	}
	return value;
}
```

Two new cases:

```ts
it("adopts a key-reordered echo of the baseline silently (jsonb round-trip)", () => {
	// render hook with schema A; do NOT edit (clean draft)
	// rerender with reorderKeys(structuredClone(A)) — new identity, same content
	// expect: baselineConflict === false, dirty === false, draft unchanged
});

it("does not flag baselineConflict for a reordered echo while dirty", () => {
	// render hook with schema A; apply an edit (draft dirty)
	// rerender with reorderKeys(structuredClone(A))
	// expect: baselineConflict === false, dirty === true, edited draft kept
});
```

Flesh these out against the real harness — assertions above are the contract; use `structuredClone` so the echo is never referentially equal. Also confirm the file still has a case where a *genuinely different* schema while dirty sets `baselineConflict: true` (it exists — Amendment 3 coverage); if its fixture would now be content-equal under deepEqual, adjust it to differ in content, not just order.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/editor/__tests__/use-spec-draft.test.tsx`
Expected: the two new cases FAIL (reordered echo currently takes the adoption/conflict branch, so the dirty case asserts `baselineConflict === false` but gets `true`). All pre-existing cases PASS.

- [ ] **Step 3: Swap the comparisons**

In `src/editor/use-spec-draft.ts`:

1. Add import: `import { deepEqual } from "./deep-equal";`
2. Delete the `baselineJson` memo (line 79) and rewrite the stale half of its comment block (lines 74-78) — the F6 explanation above it stays, but change its "byte-for-byte" wording to "content-equal" and note key-order insensitivity:

```ts
	// ... it can only be our own save's echo, regardless of timing — adopt it
	// as the new baseline silently instead of latching a false "changed in
	// the background" warning.
	// Comparisons are deepEqual, not JSON.stringify byte-equality: backends
	// that store the schema in Postgres jsonb re-order object keys on
	// read-back, so a post-save echo is content-equal but never
	// byte-identical (#37).

	// biome-ignore lint/correctness/useExhaustiveDependencies: guard reads draft/baseline but must run only on prop change
	useEffect(() => {
		if (schema === baseline) return;
		if (deepEqual(schema, baseline)) return;
		if (deepEqual(schema, draft)) {
			setBaseline(schema);
			return;
		}
		const wasDirty = draft !== baseline;
		setBaseline(schema);
		if (!wasDirty) setDraft(schema);
		else setBaselineConflict(true);
	}, [schema]);
```

- [ ] **Step 4: Run the editor suite**

Run: `npx vitest run src/editor/__tests__/use-spec-draft.test.tsx src/editor/__tests__/spec-editor.test.tsx`
Expected: PASS (new cases green, no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/editor/use-spec-draft.ts src/editor/__tests__/use-spec-draft.test.tsx
git commit -m "fix(editor): key-order-insensitive baseline/echo compare (#37)"
```

---

### Task 3: optional strings accept "" (#38, zod half)

**Files:**
- Modify: `src/schema/zod-builder.ts:30-49` (the `!field.config.required` branch)
- Test: `src/schema/__tests__/zod-builder.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `specToZodSchema` — ALL optional string-typed fields accept `""` (previously only ones without min/max/regex checks).

- [ ] **Step 1: Write the failing tests**

Add to `src/schema/__tests__/zod-builder.test.ts` (reuse the file's `mockPlugin` helper and Field-literal style — `config` needs `name`, `api_accessor`, `required`, `instructions`; plus `settings: null, children: null, system: false`):

```ts
describe("optional constrained strings accept empty string (#38)", () => {
	const slugLike = mockPlugin(
		"slug",
		z.string().regex(/^[a-z0-9-]+$/, "invalid slug"),
	);
	const field = (required: boolean): Field => ({
		field_type: "slug",
		config: {
			name: "Slug",
			api_accessor: "slug",
			required,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
	});

	it("optional: empty string passes despite the regex check", () => {
		const schema = specToZodSchema([field(false)], [slugLike]);
		expect(schema.safeParse({ slug: "" }).success).toBe(true);
	});

	it("optional: non-empty values still hit the regex", () => {
		const schema = specToZodSchema([field(false)], [slugLike]);
		expect(schema.safeParse({ slug: "valid-slug" }).success).toBe(true);
		expect(schema.safeParse({ slug: "Not Valid!" }).success).toBe(false);
	});

	it("required: empty string still fails", () => {
		const schema = specToZodSchema([field(true)], [slugLike]);
		expect(schema.safeParse({ slug: "" }).success).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/__tests__/zod-builder.test.ts`
Expected: FAIL — first case: `""` rejected by the regex (the constrained branch currently applies plain `.optional()`).

- [ ] **Step 3: Collapse the constraint discrimination**

Replace lines 30-49 of `src/schema/zod-builder.ts` (the whole `if (!field.config.required)` block) with:

```ts
		if (!field.config.required) {
			// Optional strings are "empty or valid" (#38): a cleared text
			// control produces "" and must not fail min/regex checks — an
			// optional slug you can't empty isn't optional. "" is kept in the
			// parsed output. Required fields are unaffected ("" still fails
			// their checks).
			if (zodType._def.typeName === z.ZodFirstPartyTypeKind.ZodString) {
				zodType = zodType.or(z.literal("")).optional() as ZodTypeAny;
			} else {
				zodType = zodType.optional() as ZodTypeAny;
			}
		}
```

- [ ] **Step 4: Run the schema suite**

Run: `npx vitest run src/schema/__tests__/`
Expected: PASS. If a pre-existing case asserted that an optional constrained string REJECTS `""`, that case codified the bug — flip its expectation and note `#38` in the test name.

- [ ] **Step 5: Commit**

```bash
git add src/schema/zod-builder.ts src/schema/__tests__/zod-builder.test.ts
git commit -m "fix(schema): optional strings accept empty string (#38)"
```

---

### Task 4: plugin contract `defaultValue` + `getDefaultValues(fields, plugins?)` (#38 core)

**Files:**
- Modify: `src/schema/plugin.ts` (FieldTypePlugin interface, after `defaultSettings?`)
- Modify: `src/schema/zod-builder.ts:61-72` (`getDefaultValues`)
- Test: `src/schema/__tests__/zod-builder.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `FieldTypePlugin.defaultValue?: (field: Field<S>) => unknown`
  - `getDefaultValues(fields: Field[], plugins?: FieldTypePlugin[]): Record<string, unknown>` — without `plugins`, sparse (today's behavior); with `plugins`, seeds every visible non-structural field whose plugin declares `defaultValue`; explicit `config.default_value` always wins. Tasks 5-6 rely on exactly this.

- [ ] **Step 1: Write the failing tests**

Add to `src/schema/__tests__/zod-builder.test.ts`. Extend the local `mockPlugin` helper with an optional third param instead of duplicating it:

```ts
function mockPlugin(
	id: string,
	zodType: z.ZodTypeAny,
	defaultValue?: (field: Field) => unknown,
): FieldTypePlugin {
	return {
		id,
		name: id,
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => zodType,
		...(defaultValue ? { defaultValue } : {}),
	};
}
```

```ts
describe("getDefaultValues with plugins (#38)", () => {
	const boolPlugin = mockPlugin("boolean", z.boolean(), () => false);
	const textPlugin = mockPlugin("text", z.string(), () => "");
	const noDefaultPlugin = mockPlugin("mystery", z.unknown());
	const mk = (
		type: string,
		accessor: string,
		extra?: Partial<Field["config"]>,
	): Field => ({
		field_type: type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
			...extra,
		},
		settings: null,
		children: null,
		system: false,
	});

	it("stays sparse without plugins (back-compat)", () => {
		expect(getDefaultValues([mk("boolean", "flag")])).toEqual({});
	});

	it("seeds plugin defaults for visible fields", () => {
		const out = getDefaultValues(
			[mk("boolean", "flag"), mk("text", "title")],
			[boolPlugin, textPlugin],
		);
		expect(out).toEqual({ flag: false, title: "" });
	});

	it("explicit config.default_value wins over the plugin default", () => {
		const out = getDefaultValues(
			[mk("boolean", "flag", { default_value: true })],
			[boolPlugin],
		);
		expect(out).toEqual({ flag: true });
	});

	it("leaves fields of default-less plugins unseeded (key absent)", () => {
		const out = getDefaultValues([mk("mystery", "m")], [noDefaultPlugin]);
		expect("m" in out).toBe(false);
	});

	it("skips hidden and structural fields", () => {
		const out = getDefaultValues(
			[mk("boolean", "hiddenFlag", { hidden: true }), mk("section", "s")],
			[boolPlugin, mockPlugin("section", z.unknown(), () => "NEVER")],
		);
		expect(out).toEqual({});
	});
});
```

(If `default_value`/`hidden` aren't in the `Field["config"]` type as written, match the real `FieldConfig` property names — check `src/schema/types.ts` — the runtime code reads `config.default_value` and `config.hidden`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/__tests__/zod-builder.test.ts`
Expected: FAIL — TS error: `defaultValue` not on `FieldTypePlugin`, and/or seeding cases get `{}`.

- [ ] **Step 3: Implement contract + seeding**

`src/schema/plugin.ts` — add after `defaultSettings?: S;`:

```ts
	/** Sane form-value default for fields of this type when the spec has no
	 * explicit `config.default_value` (value-level — `defaultSettings` seeds
	 * settings, not values). Always a function: settings-dependent shapes
	 * are natural, and array/object defaults stay fresh per call instead of
	 * being shared across forms. Omit when no safe default exists — the
	 * field then stays undefined. */
	defaultValue?: (field: Field<S>) => unknown;
```

`src/schema/zod-builder.ts` — replace `getDefaultValues`:

```ts
export function getDefaultValues(
	fields: Field[],
	plugins?: FieldTypePlugin[],
): Record<string, unknown> {
	const pluginMap = plugins
		? new Map(plugins.map((p) => [p.id, p]))
		: undefined;
	const defaults: Record<string, unknown> = {};

	for (const field of fields) {
		if (STRUCTURAL_TYPES.has(field.field_type)) continue;
		if (field.config.hidden) continue;
		if (field.config.default_value !== undefined) {
			defaults[field.config.api_accessor] = field.config.default_value;
			continue;
		}
		const defaultValue = pluginMap?.get(field.field_type)?.defaultValue;
		if (defaultValue) {
			defaults[field.config.api_accessor] = defaultValue(
				field as Field<unknown>,
			);
		}
	}

	return defaults;
}
```

(The `STRUCTURAL_TYPES` skip is new but behavior-neutral for the sparse path: sections never carry `default_value`.)

- [ ] **Step 4: Run schema suite, typecheck**

Run: `npx vitest run src/schema/__tests__/ && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema/plugin.ts src/schema/zod-builder.ts src/schema/__tests__/zod-builder.test.ts
git commit -m "feat(schema): plugin defaultValue contract in getDefaultValues (#38)"
```

---

### Task 5: built-in `defaultValue` declarations + registry pin (#38)

**Files:**
- Modify (add one `defaultValue` member to each plugin object literal, placed directly after `toZodType` or `defaultSettings`, whichever the file has last):
  - `src/schema/field-types/text.ts`, `textarea.ts`, `email.ts`, `url.ts`, `slug.ts`, `markdown.ts`, `code.ts` → `defaultValue: () => "",`
  - `src/schema/field-types/number.ts` → `defaultValue: () => 0,`
  - `src/schema/field-types/boolean.ts` → `defaultValue: () => false,`
  - `src/schema/field-types/checkboxes.ts`, `media.ts`, `group.ts`, `array.ts`, `blocks.ts`, `virtual-table.ts` → `defaultValue: () => [],`
  - `src/schema/field-types/select.ts` → `defaultValue: (field) => (field.settings?.multiple ? [] : ""),`
  - `src/schema/field-types/reference.ts` → `defaultValue: (field) => (field.settings?.max_items === 1 ? "" : []),`
  - NOT touched (deliberately no default): `color.ts`, `time.ts`, `date.ts`, `radio.ts`, `rich-text.ts`, `toc-reference.ts`, `section.ts`
- Test: Create `src/schema/field-types/__tests__/default-values.test.ts`

**Interfaces:**
- Consumes: `defaultValue` contract (Task 4); `""`-tolerant optional strings (Task 3 — slug's `""` default must parse).
- Produces: every built-in plugin's declared/omitted default, pinned both directions. mediahub's stopgap map deletion relies on this exact table.

- [ ] **Step 1: Write the failing test**

```ts
// src/schema/field-types/__tests__/default-values.test.ts
import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { getDefaultValues, specToZodSchema } from "../../zod-builder";
import { builtInFieldTypes } from "../index";

/** Pinned #38 defaults — update BOTH this table and the spec when a plugin's
 * default changes. Function results are asserted via resolve() below. */
const SEEDED: Record<string, unknown> = {
	text: "",
	textarea: "",
	email: "",
	url: "",
	slug: "",
	markdown: "",
	code: "",
	number: 0,
	boolean: false,
	checkboxes: [],
	media: [],
	group: [],
	array: [],
	blocks: [],
	virtual_table: [],
	select: "", // single (settings.multiple falsy); multi pinned separately
	reference: [], // default settings (max_items undefined); 1 pinned separately
};
const UNSEEDED = [
	"color",
	"time",
	"date",
	"radio",
	"rich_text",
	"toc_reference",
	"section",
];

function fieldOf(type: string, settings: unknown = null): Field {
	return {
		field_type: type,
		config: {
			name: type,
			api_accessor: "value",
			required: false,
			instructions: "",
		},
		settings,
		children: null,
		system: false,
	} as Field;
}

describe("built-in plugin defaultValue registry pin (#38)", () => {
	it("covers every built-in plugin exactly once", () => {
		const ids = builtInFieldTypes.map((p) => p.id).sort();
		const pinned = [...Object.keys(SEEDED), ...UNSEEDED].sort();
		expect(ids).toEqual(pinned);
	});

	for (const [id, expected] of Object.entries(SEEDED)) {
		it(`${id} seeds ${JSON.stringify(expected)}`, () => {
			const plugin = builtInFieldTypes.find((p) => p.id === id);
			expect(plugin?.defaultValue).toBeTypeOf("function");
			expect(plugin?.defaultValue?.(fieldOf(id))).toEqual(expected);
		});
	}

	for (const id of UNSEEDED) {
		it(`${id} deliberately declares NO defaultValue`, () => {
			const plugin = builtInFieldTypes.find((p) => p.id === id);
			expect(plugin).toBeDefined();
			expect(plugin?.defaultValue).toBeUndefined();
		});
	}

	it("select is settings-dependent: multiple → []", () => {
		const select = builtInFieldTypes.find((p) => p.id === "select");
		expect(select?.defaultValue?.(fieldOf("select", { multiple: true }))).toEqual([]);
	});

	it("reference is settings-dependent: max_items 1 → \"\"", () => {
		const reference = builtInFieldTypes.find((p) => p.id === "reference");
		expect(reference?.defaultValue?.(fieldOf("reference", { max_items: 1 }))).toBe("");
	});

	it("array/object defaults are fresh instances per call", () => {
		const checkboxes = builtInFieldTypes.find((p) => p.id === "checkboxes");
		const a = checkboxes?.defaultValue?.(fieldOf("checkboxes"));
		const b = checkboxes?.defaultValue?.(fieldOf("checkboxes"));
		expect(a).toEqual([]);
		expect(a).not.toBe(b);
	});

	it("every seeded default parses against the plugin's own optional zod type", () => {
		for (const plugin of builtInFieldTypes) {
			if (!plugin.defaultValue) continue;
			const field = fieldOf(plugin.id);
			const seeded = getDefaultValues([field], [plugin]);
			const schema = specToZodSchema([field], [plugin]);
			const result = schema.safeParse(seeded);
			expect(result.success, `${plugin.id} default must satisfy its own zod`).toBe(true);
		}
	});
});
```

If a built-in plugin id differs from this table (e.g. `rich_text` vs `richtext`), fix the TABLE to the real id — the ids come from each plugin's `id` member; the coverage case will catch any mismatch.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/field-types/__tests__/default-values.test.ts`
Expected: FAIL — every `seeds` case: `defaultValue` is `undefined`.

- [ ] **Step 3: Add the members**

Add the exact `defaultValue` lines listed under **Files** to each plugin object literal. Select and reference use their settings types (already imported in those files), e.g. in `select.ts`:

```ts
	defaultValue: (field: Field<SelectSettings>) =>
		field.settings?.multiple ? [] : "",
```

and in `reference.ts`:

```ts
	defaultValue: (field: Field<ReferenceSettings>) =>
		field.settings?.max_items === 1 ? "" : [],
```

- [ ] **Step 4: Run test + full schema suite**

Run: `npx vitest run src/schema/ && npm run typecheck`
Expected: PASS — including the parse-against-own-zod sweep (slug's `""` needs Task 3; virtual_table/group `[]` parse against their `z.array(...)` shapes).

- [ ] **Step 5: Commit**

```bash
git add src/schema/field-types/
git commit -m "feat(schema): declare defaultValue on built-in plugins (#38)"
```

---

### Task 6: wire internal getDefaultValues callers (#38)

**Files:**
- Modify: `src/schema/define-spec.ts` (new options param)
- Modify: `src/editor/try-it-view.tsx:45`
- Modify: `src/editor/editor-canvas.tsx:245-251` (memo + deps)
- Modify: `src/table/edit-drawer.tsx:37-40` (memo + deps)
- Test: `src/schema/__tests__/define-spec.test.ts`

**Interfaces:**
- Consumes: `getDefaultValues(fields, plugins?)` (Task 4), built-in defaults (Task 5).
- Produces: `defineSpec(fieldsOrNested, options?: DefineSpecOptions)` with `DefineSpecOptions = { plugins?: FieldTypePlugin[] }` (exported from the same file, flows through the `/schema` subpath).

- [ ] **Step 1: Write the failing test (defineSpec)**

Add to `src/schema/__tests__/define-spec.test.ts` (reuse its existing fixture style):

```ts
import { builtInFieldTypes } from "../field-types";

it("seeds plugin defaults when options.plugins is passed (#38)", () => {
	const spec = defineSpec(
		[
			{
				field_type: "boolean",
				config: {
					name: "Flag",
					api_accessor: "flag",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		],
		{ plugins: builtInFieldTypes },
	);
	expect(spec.defaultValues).toEqual({ flag: false });
});

it("stays sparse without options (back-compat)", () => {
	const spec = defineSpec([
		{
			field_type: "boolean",
			config: {
				name: "Flag",
				api_accessor: "flag",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		},
	]);
	expect(spec.defaultValues).toEqual({});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/__tests__/define-spec.test.ts`
Expected: FAIL — `defineSpec` takes one argument.

- [ ] **Step 3: Implement all four call sites**

`src/schema/define-spec.ts`:

```ts
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";
import { getDefaultValues } from "./zod-builder";

export interface SpecDefinition {
	fields: Field[];
	defaultValues: Record<string, unknown>;
}

export interface DefineSpecOptions {
	/** Enables per-type value defaults (#38): fields without an explicit
	 * config.default_value are seeded from their plugin's defaultValue. */
	plugins?: FieldTypePlugin[];
}

export function defineSpec(
	fieldsOrNested: (Field | Field[])[],
	options?: DefineSpecOptions,
): SpecDefinition {
	const fields = fieldsOrNested.flat();

	return {
		fields,
		defaultValues: getDefaultValues(fields, options?.plugins),
	};
}
```

`src/editor/try-it-view.tsx` line 45 (component has `plugins` in scope):

```ts
		defaultValues: getDefaultValues(schema, plugins),
```

`src/editor/editor-canvas.tsx` lines ~248-251 (component has `plugins` prop in scope; add it to the memo deps):

```ts
	const { defaults, serialized: serializedDefaults } = useMemo(() => {
		const next = getDefaultValues(draft, plugins);
		return { defaults: next, serialized: JSON.stringify(next) };
	}, [draft, plugins]);
```

`src/table/edit-drawer.tsx` lines ~37-40 (component has `plugins` prop; add to deps):

```ts
	const defaults = useMemo(() => {
		const specDefaults = getDefaultValues(schema, plugins);
		return { ...specDefaults, ...initialValues };
	}, [schema, plugins, initialValues]);
```

- [ ] **Step 4: Full suite + typecheck**

Run: `npm run test && npm run typecheck && npm run verify-exports`
Expected: PASS. Watch specifically `src/editor/__tests__/try-it.test.tsx` and `editor-canvas.test.tsx` — scratch forms now seed real defaults; if any assertion pinned the OLD sparse defaults object, update it to the seeded expectation (that is the intended behavior change, not a regression).

- [ ] **Step 5: Commit**

```bash
git add src/schema/define-spec.ts src/schema/__tests__/define-spec.test.ts src/editor/try-it-view.tsx src/editor/editor-canvas.tsx src/table/edit-drawer.tsx
git commit -m "feat: pass plugins to getDefaultValues at all internal callers (#38)"
```

---

### Task 7: SpecEditor `formatSaveError` (#36)

**Files:**
- Modify: `src/editor/spec-editor.tsx` (props interface at ~line 263; saveError toast effect at ~line 305-312; module-scope default formatter)
- Test: `src/editor/__tests__/spec-editor.test.tsx` (extend the existing saveFailed toast coverage at ~line 215)

**Interfaces:**
- Consumes: `spec.saveError: unknown | null` (already exposed by `useSpecDraft`).
- Produces: `SpecEditorProps.formatSaveError?: (reason: unknown) => string | null`.

- [ ] **Step 1: Write the failing tests**

Locate the existing saveFailed test in `src/editor/__tests__/spec-editor.test.tsx` (search `saveFailed`) and add cases in its style — same harness: render SpecEditor with a rejecting `onCommit`, make the draft dirty, click Save, await the toast. New cases:

```ts
it("saveFailed toast carries the Error message as description by default (#36)", async () => {
	// onCommit: () => Promise.reject(new Error("Server said no"))
	// ... dirty the draft, click Save ...
	// await screen.findByText(L.saveFailed)   // title (existing behavior)
	await screen.findByText("Server said no"); // description (new)
});

it("stringifies non-Error rejections", async () => {
	// onCommit: () => Promise.reject("quota exceeded")
	await screen.findByText("quota exceeded");
});

it("formatSaveError overrides the default formatter", async () => {
	// <SpecEditor formatSaveError={() => "translated"} ... />
	// onCommit rejects with new Error("raw")
	await screen.findByText("translated");
	expect(screen.queryByText("raw")).toBeNull();
});

it("formatSaveError returning null suppresses the description", async () => {
	// <SpecEditor formatSaveError={() => null} ... />
	// onCommit rejects with new Error("raw server text")
	await screen.findByText(L.saveFailed);
	expect(screen.queryByText("raw server text")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/__tests__/spec-editor.test.tsx`
Expected: the four new cases FAIL (no description rendered; unknown prop).

- [ ] **Step 3: Implement**

Module scope in `src/editor/spec-editor.tsx`:

```ts
const defaultFormatSaveError = (reason: unknown): string | null =>
	reason instanceof Error ? reason.message : String(reason);
```

Props interface (after the existing label/props members, ~line 263):

```ts
	/** Formats a rejected onCommit reason into the saveFailed toast
	 * description. Return null (or "") to suppress the description and get
	 * the pre-0.7 title-only toast. Default: Error → message, otherwise
	 * String(reason). */
	formatSaveError?: (reason: unknown) => string | null;
```

Destructure `formatSaveError` in the component signature, then update the effect:

```ts
	const lastSaveErrorRef = useRef<unknown | null>(null);
	useEffect(() => {
		if (spec.saveError != null && spec.saveError !== lastSaveErrorRef.current) {
			const format = formatSaveError ?? defaultFormatSaveError;
			const description = format(spec.saveError);
			toaster.create({
				title: mergedLabels.saveFailed,
				...(description ? { description } : {}),
				type: "error",
			});
		}
		lastSaveErrorRef.current = spec.saveError;
	}, [spec.saveError, mergedLabels.saveFailed, formatSaveError]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor/__tests__/spec-editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/spec-editor.tsx src/editor/__tests__/spec-editor.test.tsx
git commit -m "feat(editor): saveFailed toast description via formatSaveError (#36)"
```

---

### Task 8: docs + version bump

**Files:**
- Modify: `src/editor/spec-editor.mdx` (document `formatSaveError` next to the existing saveFailed/labels documentation; note the new default description behavior and the null opt-out)
- Modify: `CLAUDE.md` — in "Adding a New Field Type Plugin" step 1, extend the contract bullet: `... toZodType(), defaultSettings` → also name `defaultValue` (value-level form default, function form; omit when no safe default exists)
- Modify: `package.json` — `"version": "0.6.0"` → `"version": "0.7.0"`

**Interfaces:**
- Consumes: everything above.
- Produces: release-ready branch. The tag push / npm publish is NOT part of this plan (explicit user OK required).

- [ ] **Step 1: spec-editor.mdx**

Add to the props/behavior documentation (place it where saveFailed/toast behavior is described; match the file's prose style):

```mdx
### Save-failure description (`formatSaveError`)

When `onCommit` rejects, the `saveFailed` toast now carries a description:
by default the rejection's `Error.message` (non-`Error` reasons are
stringified). Pass `formatSaveError={(reason) => string | null}` to
translate or sanitize the text; return `null` to suppress the description
entirely (the pre-0.7 title-only toast). The `saveFailed` label itself is
unchanged.
```

- [ ] **Step 2: CLAUDE.md plugin checklist**

In the "Adding a New Field Type Plugin" section, extend the first bullet to include `defaultValue`:

```md
   - Export a `FieldTypePlugin` with `id`, `name`, `description`, `icon` (Lucide), `category`, `toZodType()`, `defaultSettings`, and — when a safe one exists — `defaultValue` (function returning the value-level form default; see #38)
```

- [ ] **Step 3: Version bump**

`package.json`: `"version": "0.7.0"`.

- [ ] **Step 4: Full gates**

Run: `npm run test && npm run typecheck && npm run lint && npm run verify-exports && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/spec-editor.mdx CLAUDE.md package.json
git commit -m "docs: formatSaveError + defaultValue contract docs; chore: v0.7.0"
```

---

## Post-plan (not tasks)

- Fable final whole-branch review, then runtime gate (Storybook: Try-it seeds defaults; SpecEditor save-failure toast shows description; slug field clearable in an optional spec), then merge to main.
- Release: tag `v0.7.0` push (publish-fieldkit.yml) **only after explicit user OK**.
- Downstream (hygiene bundle, separate): mediahub deletes `FIELD_TYPE_DEFAULTS`/`UNSEEDED_FIELD_TYPES` + pins, bumps fieldkit to 0.7.0, re-tests #72's Discard quirk for the narrowed unseeded set.
