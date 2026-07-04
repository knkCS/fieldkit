# WYSIWYG SpecEditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the row-list SpecEditor with a WYSIWYG canvas that renders the real form (via renderer building blocks), edited in place, with a draft session, side config panel, and a Try-it mode.

**Architecture:** `EditorCanvas` composes renderer pieces (`partitionSchemaBySections`, real plugin `fieldComponent`s in an inert `FieldShell`, `FieldSearch`); Try-it mode renders the actual `SpecForm` on a scratch form. Draft state lives in pure `draft-ops` functions + a `useSpecDraft` hook; `onCommit` replaces `onChange`. `FieldModal` is dismantled into panel sections.

**Tech Stack:** React 19, dnd-kit (existing sensors), @knkcs/anker ≥ 2.11 (`Popover`/`Menu`/`Tooltip`/`toaster` from `/primitives`, `Button`/`IconButton` from `/atoms`, `ConfirmModalProvider`/`useConfirmModal` from `/feedback`), react-hook-form + zod (Try-it only), Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-04-editor-redesign-design.md` — read it before starting.

## Global Constraints

- Conventional Commits: `<type>(<scope>): <description>`, imperative, ≤ 72 chars. Scope `editor` (or `schema` for Task 1).
- No new dependencies. Every exported React component sets `displayName`.
- anker tokens/components only — this project deletes the editor's inline CSS; do not add any (`style={{…}}` only for dnd transform strings, which are not styling).
- Dependency direction: `/editor` imports from `/renderer` and `/schema`, never the reverse. `/renderer` and `/schema` files are read-only for this plan except `src/schema/validate-spec.ts` (Task 1) and one sanctioned change to `src/renderer/field-component.tsx`'s memo comparator (Task 5 — live preview depends on it).
- Every author-facing string (tooltips, aria-labels, empty states, confirm texts, panel headings) goes through `EditorLabels` with an English default — no hardcoded UI copy outside the `DEFAULT_EDITOR_LABELS` object (Task 12 defines it; earlier tasks take the strings they need as props and their tests pass English values).
- System fields (`field.system === true`): no delete button, accessor read-only in the panel, lock indicator on the shell. `duplicateField` always forces `system: false` on the copy.
- `onCommit` may only ever receive a spec for which `validateSpec(...).valid === true`.
- Run `npm run test && npm run typecheck && npm run lint` before every commit; all must pass.
- Test env facts: `src/test/setup.ts` already stubs `window.matchMedia`; wrap Chakra-rendering tests in `ChakraProvider value={defaultSystem}` (see `src/renderer/spec-form/__tests__/helpers.tsx`); tab clicks need `await act(async () => { fireEvent.click(...) })`; jsdom has no `scrollIntoView` (guard with `?.scrollIntoView?.()`); `@testing-library/user-event` is NOT installed — use `fireEvent`.
- Existing editor tests (`src/editor/__tests__/spec-editor.test.tsx`, `field-modal.test.tsx`, `type-picker.test.tsx`) will be replaced/updated in the tasks that replace their subjects — never deleted without replacement coverage.

## File Structure

```
src/schema/validate-spec.ts        MODIFY (T1) — duplicate-accessor + empty checks
src/editor/
  draft-ops.ts                     CREATE (T2) — pure draft mutations
  use-spec-draft.ts                CREATE (T3) — draft session hook
  field-shell.tsx                  CREATE (T4) — inert wrapper + selection + toolbar
  editor-canvas.tsx                CREATE (T5) — tabs + shells + scratch form
  type-picker-popover.tsx          CREATE (T6) — ⊕ insertion + TypePicker popover
  section-menu.tsx                 CREATE (T7) — per-tab ⌄ menu + "+ Section"
  (canvas dnd wiring)              MODIFY (T8) — editor-canvas.tsx
  panel-sections/config-section.tsx     CREATE (T9)
  panel-sections/validation-section.tsx CREATE (T9)
  panel-sections/settings-section.tsx   CREATE (T9)
  field-config-panel.tsx           CREATE (T9) — panel frame + group drill-in
  (validation surfacing)           MODIFY (T10) — canvas + shell + panel
  try-it-view.tsx                  CREATE (T11)
  spec-editor.tsx                  REWRITE (T12) — shell; field-modal.tsx DELETED
  index.ts                         MODIFY (T13) — exports
  spec-editor.stories.tsx          REWRITE (T13) + MDX
```

---

### Task 1: extend `validateSpec` with accessor checks

**Files:**
- Modify: `src/schema/validate-spec.ts`
- Test: `src/schema/__tests__/validate-spec.test.ts` (exists — extend)

**Interfaces:**
- Consumes: existing `validateSpec(fields: Field[], plugins: Map<string, FieldTypePlugin>): SpecValidationResult` (today it only checks `maxPerSpec`).
- Produces (used by T3/T10): same signature; additionally reports duplicate `api_accessor`s and empty `name`/`api_accessor`. New export:

```ts
export type SpecFieldErrorCode = "duplicate_accessor" | "empty_name" | "empty_accessor";
export interface SpecFieldError {
	accessor: string;
	code: SpecFieldErrorCode; // stable — the editor maps codes to translated messages
	message: string;          // English default
}
export interface SpecValidationResult {
	valid: boolean;
	errors: string[];              // unchanged, message list
	fieldErrors: SpecFieldError[]; // NEW — per-field, for canvas outlines
}
```

- [ ] **Step 1: Write the failing tests** — append to `src/schema/__tests__/validate-spec.test.ts` (reuse its existing helpers/imports; add `makeField` if it lacks one):

```ts
describe("validateSpec — accessor checks", () => {
	const plugins = new Map([["text", textPlugin]]); // reuse the file's plugin fixture

	function f(accessor: string, name = accessor): Field {
		return {
			field_type: "text",
			config: { name, api_accessor: accessor, required: false, instructions: "" },
			settings: null,
			system: false,
		};
	}

	it("reports duplicate accessors with fieldErrors", () => {
		const result = validateSpec([f("a"), f("a")], plugins);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors).toContainEqual({
			accessor: "a",
			code: "duplicate_accessor",
			message: 'Duplicate accessor "a"',
		});
	});

	it("reports empty name and empty accessor", () => {
		const result = validateSpec([f("", "")], plugins);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors.length).toBeGreaterThanOrEqual(1);
	});

	it("keeps fieldErrors empty for a valid spec", () => {
		const result = validateSpec([f("a"), f("b")], plugins);
		expect(result.valid).toBe(true);
		expect(result.fieldErrors).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/__tests__/validate-spec.test.ts`
Expected: FAIL — `fieldErrors` undefined.

- [ ] **Step 3: Implement** — in `src/schema/validate-spec.ts`, extend the result interface as above and add after the existing maxPerSpec loop:

```ts
	const fieldErrors: SpecFieldError[] = [];
	const seen = new Map<string, number>();
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		if (!field.config.name.trim()) {
			fieldErrors.push({ accessor, code: "empty_name", message: "Name must not be empty" });
		}
		if (!accessor.trim()) {
			fieldErrors.push({ accessor, code: "empty_accessor", message: "Accessor must not be empty" });
		} else {
			seen.set(accessor, (seen.get(accessor) ?? 0) + 1);
		}
	}
	for (const [accessor, count] of seen) {
		if (count > 1) {
			fieldErrors.push({
				accessor,
				code: "duplicate_accessor",
				message: `Duplicate accessor "${accessor}"`,
			});
		}
	}
	for (const fe of fieldErrors) {
		errors.push(fe.message);
	}

	return { valid: errors.length === 0, errors, fieldErrors };
```

(Adjust the existing return statement — there is exactly one.)

- [ ] **Step 4: Run tests** — `npx vitest run src/schema/__tests__/validate-spec.test.ts` → PASS. Also `npx vitest run src/editor/` → the existing spec-editor add-flow test must still pass (it calls validateSpec on append).

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/schema/validate-spec.ts src/schema/__tests__/validate-spec.test.ts
git commit -m "feat(schema): per-field accessor checks in validateSpec"
```

---

### Task 2: pure draft operations

**Files:**
- Create: `src/editor/draft-ops.ts`
- Create: `src/editor/__tests__/draft-ops.test.ts`

**Interfaces:**
- Consumes: `Field`, `Schema` from `../schema/types`; `partitionSchemaBySections`, `SpecTab` from `../schema/partition`; `SectionSettings` from `../schema/field-types/section`.
- Produces (used by T3, T7, T8, T9) — all pure, all return NEW arrays, never mutate input:

```ts
export function insertFieldAt(schema: Schema, field: Field, index: number): Schema;
export function updateField(schema: Schema, accessor: string, next: Field): Schema;
export function removeField(schema: Schema, accessor: string): Schema;
export function moveField(schema: Schema, fromIndex: number, toIndex: number): Schema;
export function uniquifyAccessor(schema: Schema, base: string): string; // base, base_copy, base_copy2… (duplicates)
export function nextAccessor(schema: Schema, base: string): string;      // base, base_2, base_3… (fresh inserts)
export function duplicateField(schema: Schema, accessor: string): Schema; // copy inserted directly after
export function addSection(schema: Schema, name: string): Schema; // appends section marker at end
export function renameSection(schema: Schema, sectionAccessor: string, name: string): Schema;
export function moveSection(schema: Schema, sectionAccessor: string, direction: -1 | 1): Schema; // moves the whole block (marker + its fields)
export function deleteSection(schema: Schema, sectionAccessor: string): Schema; // removes marker only → fields merge into preceding tab (leading fields if first)
export function setOrientation(schema: Schema, orientation: "horizontal" | "vertical"): Schema; // writes first section's settings
export function moveFieldToSection(schema: Schema, accessor: string, tabIndex: number): Schema; // append to that tab's fields
```

Section markers are `field_type === "section"`. `addSection` builds:

```ts
{
	field_type: "section",
	config: { name, api_accessor: uniquifyAccessor(schema, slugify(name)), required: false, instructions: "" },
	settings: {},
	system: false,
}
```

with `slugify(name)` = lowercase, spaces→`_`, strip non `[a-z0-9_]` (module-local helper; empty result falls back to `"section"`).

- [ ] **Step 1: Write the failing tests** — `src/editor/__tests__/draft-ops.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Field, Schema } from "../../schema/types";
import {
	addSection, deleteSection, duplicateField, insertFieldAt, moveField,
	moveFieldToSection, moveSection, nextAccessor, removeField,
	renameSection, setOrientation, uniquifyAccessor, updateField,
} from "../draft-ops";

function f(accessor: string, type = "text"): Field {
	return {
		field_type: type,
		config: { name: accessor, api_accessor: accessor, required: false, instructions: "" },
		settings: type === "section" ? {} : null,
		system: false,
	};
}
const s = (accessor: string) => f(accessor, "section");

describe("field ops", () => {
	it("insertFieldAt inserts at index without mutating input", () => {
		const schema: Schema = [f("a"), f("b")];
		const out = insertFieldAt(schema, f("x"), 1);
		expect(out.map((x) => x.config.api_accessor)).toEqual(["a", "x", "b"]);
		expect(schema).toHaveLength(2);
	});

	it("updateField replaces by accessor", () => {
		const out = updateField([f("a")], "a", { ...f("a"), config: { ...f("a").config, name: "A!" } });
		expect(out[0].config.name).toBe("A!");
	});

	it("removeField removes by accessor", () => {
		expect(removeField([f("a"), f("b")], "a").map((x) => x.config.api_accessor)).toEqual(["b"]);
	});

	it("moveField reorders", () => {
		expect(moveField([f("a"), f("b"), f("c")], 0, 2).map((x) => x.config.api_accessor)).toEqual(["b", "c", "a"]);
	});

	it("uniquifyAccessor appends _copy, _copy2", () => {
		expect(uniquifyAccessor([f("a")], "a")).toBe("a_copy");
		expect(uniquifyAccessor([f("a"), f("a_copy")], "a")).toBe("a_copy2");
		expect(uniquifyAccessor([f("a")], "b")).toBe("b");
	});

	it("duplicateField inserts the copy directly after the original", () => {
		const out = duplicateField([f("a"), f("b")], "a");
		expect(out.map((x) => x.config.api_accessor)).toEqual(["a", "a_copy", "b"]);
		expect(out[1].config.name).toBe("a");
	});

	it("duplicateField forces system: false on the copy", () => {
		const sys = { ...f("a"), system: true };
		const out = duplicateField([sys], "a");
		expect(out[1].system).toBe(false);
	});

	it("nextAccessor uses numeric suffixes for fresh inserts", () => {
		expect(nextAccessor([f("text")], "text")).toBe("text_2");
		expect(nextAccessor([f("text"), f("text_2")], "text")).toBe("text_3");
		expect(nextAccessor([], "text")).toBe("text");
	});
});

describe("section ops", () => {
	it("addSection appends a section marker with slugified unique accessor", () => {
		const out = addSection([f("a")], "My Tab");
		const last = out[out.length - 1];
		expect(last.field_type).toBe("section");
		expect(last.config.name).toBe("My Tab");
		expect(last.config.api_accessor).toBe("my_tab");
	});

	it("renameSection renames the marker", () => {
		const out = renameSection([s("s1"), f("a")], "s1", "Renamed");
		expect(out[0].config.name).toBe("Renamed");
	});

	it("moveSection moves the whole block", () => {
		// [a][s1 b][s2 c] — move s2 left → [a][s2 c][s1 b]
		const out = moveSection([f("a"), s("s1"), f("b"), s("s2"), f("c")], "s2", -1);
		expect(out.map((x) => x.config.api_accessor)).toEqual(["a", "s2", "c", "s1", "b"]);
	});

	it("moveSection left on the FIRST section is a no-op (implicit tab is fixed)", () => {
		const schema = [f("a"), s("s1"), f("b")];
		expect(moveSection(schema, "s1", -1)).toBe(schema);
	});

	it("moveSection right on the last section is a no-op", () => {
		const schema = [s("s1"), f("a"), s("s2"), f("b")];
		expect(moveSection(schema, "s2", 1)).toBe(schema);
	});

	it("moveSection on a single-section schema is a no-op in both directions", () => {
		const schema = [f("a"), s("s1"), f("b")];
		expect(moveSection(schema, "s1", 1)).toBe(schema);
		expect(moveSection(schema, "s1", -1)).toBe(schema);
	});

	it("deleteSection removes only the marker (fields merge left)", () => {
		const out = deleteSection([f("a"), s("s1"), f("b")], "s1");
		expect(out.map((x) => x.config.api_accessor)).toEqual(["a", "b"]);
	});

	it("setOrientation writes the FIRST section's settings", () => {
		const out = setOrientation([s("s1"), f("a"), s("s2")], "vertical");
		expect((out[0].settings as { orientation?: string }).orientation).toBe("vertical");
		expect((out[2].settings as { orientation?: string })?.orientation).toBeUndefined();
	});

	it("moveFieldToSection appends the field to the target tab", () => {
		// tabs: 0=[a] (implicit), 1=[s1: b] — move a into tab 1
		const out = moveFieldToSection([f("a"), s("s1"), f("b")], "a", 1);
		expect(out.map((x) => x.config.api_accessor)).toEqual(["s1", "b", "a"]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/editor/__tests__/draft-ops.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/editor/draft-ops.ts`:

```ts
// src/editor/draft-ops.ts
import { partitionSchemaBySections } from "../schema/partition";
import type { Field, Schema } from "../schema/types";

function slugify(name: string): string {
	const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
	return slug || "section";
}

export function insertFieldAt(schema: Schema, field: Field, index: number): Schema {
	const next = [...schema];
	next.splice(index, 0, field);
	return next;
}

export function updateField(schema: Schema, accessor: string, next: Field): Schema {
	return schema.map((f) => (f.config.api_accessor === accessor ? next : f));
}

export function removeField(schema: Schema, accessor: string): Schema {
	return schema.filter((f) => f.config.api_accessor !== accessor);
}

export function moveField(schema: Schema, fromIndex: number, toIndex: number): Schema {
	const next = [...schema];
	const [moved] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, moved);
	return next;
}

export function uniquifyAccessor(schema: Schema, base: string): string {
	const taken = new Set(schema.map((f) => f.config.api_accessor));
	if (!taken.has(base)) return base;
	if (!taken.has(`${base}_copy`)) return `${base}_copy`;
	let n = 2;
	while (taken.has(`${base}_copy${n}`)) n++;
	return `${base}_copy${n}`;
}

export function duplicateField(schema: Schema, accessor: string): Schema {
	const index = schema.findIndex((f) => f.config.api_accessor === accessor);
	if (index === -1) return schema;
	const original = schema[index];
	const copy: Field = {
		...original,
		system: false, // a copy is always user-created, even when the original is a system field
		config: { ...original.config, api_accessor: uniquifyAccessor(schema, accessor) },
	};
	return insertFieldAt(schema, copy, index + 1);
}

/** Accessor for a freshly inserted field: base, base_2, base_3… (no "_copy" — it isn't a copy). */
export function nextAccessor(schema: Schema, base: string): string {
	const taken = new Set(schema.map((f) => f.config.api_accessor));
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}_${n}`)) n++;
	return `${base}_${n}`;
}

export function addSection(schema: Schema, name: string): Schema {
	const section: Field = {
		field_type: "section",
		config: {
			name,
			api_accessor: uniquifyAccessor(schema, slugify(name)),
			required: false,
			instructions: "",
		},
		settings: {},
		system: false,
	};
	return [...schema, section];
}

export function renameSection(schema: Schema, sectionAccessor: string, name: string): Schema {
	return schema.map((f) =>
		f.field_type === "section" && f.config.api_accessor === sectionAccessor
			? { ...f, config: { ...f.config, name } }
			: f,
	);
}

/** A section block = the marker plus every field up to the next marker. */
function sectionBlockRange(schema: Schema, sectionAccessor: string): [number, number] | null {
	const start = schema.findIndex(
		(f) => f.field_type === "section" && f.config.api_accessor === sectionAccessor,
	);
	if (start === -1) return null;
	let end = schema.length;
	for (let i = start + 1; i < schema.length; i++) {
		if (schema[i].field_type === "section") {
			end = i;
			break;
		}
	}
	return [start, end];
}

export function moveSection(schema: Schema, sectionAccessor: string, direction: -1 | 1): Schema {
	const range = sectionBlockRange(schema, sectionAccessor);
	if (!range) return schema;
	const [start, end] = range;
	const block = schema.slice(start, end);
	const rest = [...schema.slice(0, start), ...schema.slice(end)];

	// Neighbor section blocks in the remaining list, in order.
	const markers = rest
		.map((f, i) => ({ f, i }))
		.filter(({ f }) => f.field_type === "section");
	// Where does the block currently begin among sections? Count markers before `start`.
	const precedingMarkers = schema.slice(0, start).filter((f) => f.field_type === "section").length;
	const targetMarkerIndex = precedingMarkers + (direction === -1 ? -1 : 1);
	// Moving the first section left is a NO-OP: the implicit tab (leading fields)
	// cannot be displaced — swapping past it would absorb those fields.
	if (direction === -1 && targetMarkerIndex < 0) return schema;
	if (direction === 1 && targetMarkerIndex >= markers.length) return schema; // already last
	const target = markers[targetMarkerIndex];
	if (!target) return schema;
	let insertAt: number;
	if (direction === -1) {
		insertAt = target.i; // before the previous section's marker
	} else {
		// after the next section's whole block
		const afterRange = sectionBlockRange(rest, target.f.config.api_accessor);
		insertAt = afterRange ? afterRange[1] : rest.length;
	}
	return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
}

export function deleteSection(schema: Schema, sectionAccessor: string): Schema {
	return schema.filter(
		(f) => !(f.field_type === "section" && f.config.api_accessor === sectionAccessor),
	);
}

export function setOrientation(
	schema: Schema,
	orientation: "horizontal" | "vertical",
): Schema {
	const firstSectionIndex = schema.findIndex((f) => f.field_type === "section");
	if (firstSectionIndex === -1) return schema;
	return schema.map((f, i) =>
		i === firstSectionIndex ? { ...f, settings: { ...(f.settings ?? {}), orientation } } : f,
	);
}

export function moveFieldToSection(schema: Schema, accessor: string, tabIndex: number): Schema {
	const field = schema.find((f) => f.config.api_accessor === accessor);
	if (!field) return schema;
	const without = removeField(schema, accessor);
	const partition = partitionSchemaBySections(without);
	const tab = partition.tabs[tabIndex];
	if (!tab) return schema;
	// Flat index just after the tab's last field (or just after its marker when empty).
	const lastOfTab = tab.fields[tab.fields.length - 1] ?? tab.section;
	if (!lastOfTab) return [field, ...without]; // implicit empty first tab
	const insertAfter = without.findIndex(
		(f) => f.config.api_accessor === lastOfTab.config.api_accessor,
	);
	return insertFieldAt(without, field, insertAfter + 1);
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/editor/__tests__/draft-ops.test.ts` → 13 PASS. If `moveSection`'s edge cases fail, fix the implementation, not the tests — the tests encode the contract.

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/draft-ops.ts src/editor/__tests__/draft-ops.test.ts
git commit -m "feat(editor): pure draft operations for spec editing"
```

---

### Task 3: `useSpecDraft`

**Files:**
- Create: `src/editor/use-spec-draft.ts`
- Create: `src/editor/__tests__/use-spec-draft.test.tsx`

**Interfaces:**
- Consumes: draft-ops (T2), `validateSpec` (T1), `partitionSchemaBySections`.
- Produces (consumed by T5–T12):

```ts
export interface SpecDraft {
	draft: Schema;
	partition: SpecPartition;          // derived, memoized
	validation: SpecValidationResult;  // derived, memoized
	dirty: boolean;
	apply: (next: Schema) => void;     // set draft (draft-ops results)
	save: () => Promise<void>;         // awaits onCommit; baseline advances ONLY on success
	saving: boolean;                   // true while an async onCommit is in flight
	saveError: unknown | null;         // last rejection; cleared on next save/apply
	discard: () => void;               // reset to the baseline
}
export function useSpecDraft(
	schema: Schema,
	plugins: FieldTypePlugin[],
	onCommit: (schema: Schema) => void | Promise<void>,
	onDirtyChange?: (dirty: boolean) => void,
): SpecDraft;
```

Semantics: seeds from `schema`. **Reset guard (data-loss protection):** when the `schema` prop's identity changes, compare content (`JSON.stringify`) against the current *baseline* — content-equal ⇒ ignore (consumers may build fresh arrays every render); content different ⇒ adopt the new schema as baseline, and reset the draft ONLY if it was clean — a dirty draft is kept (the author's work survives a background refetch; the consumer sees `dirty` stay true). `save()` awaits `onCommit(draft)`: on success the baseline advances to the draft (dirty=false); on rejection the baseline is untouched (still dirty), `saveError` is set. `dirty` is reference inequality `draft !== baseline` (an apply producing identical content counts dirty; acceptable, Discard fixes it). `onDirtyChange` fires in an effect when `dirty` changes. `save()` is a no-op while `validation.valid === false` or `saving`.

- [ ] **Step 1: Write the failing tests** — `src/editor/__tests__/use-spec-draft.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { removeField } from "../draft-ops";
import { useSpecDraft } from "../use-spec-draft";

const textPlugin: FieldTypePlugin = {
	id: "text", name: "Text", description: "", icon: () => null, category: "text",
	fieldComponent: () => null, toZodType: () => z.string(),
};

function f(accessor: string): Field {
	return {
		field_type: "text",
		config: { name: accessor, api_accessor: accessor, required: false, instructions: "" },
		settings: null, system: false,
	};
}

describe("useSpecDraft", () => {
	it("seeds from schema, not dirty", () => {
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], vi.fn()),
		);
		expect(result.current.draft).toHaveLength(1);
		expect(result.current.dirty).toBe(false);
	});

	it("apply makes it dirty; save commits and resets dirty", async () => {
		const onCommit = vi.fn();
		const { result } = renderHook(() =>
			useSpecDraft([f("a"), f("b")], [textPlugin], onCommit),
		);
		act(() => result.current.apply(removeField(result.current.draft, "b")));
		expect(result.current.dirty).toBe(true);
		await act(async () => result.current.save());
		expect(onCommit).toHaveBeenCalledWith([expect.objectContaining({ config: expect.objectContaining({ api_accessor: "a" }) })]);
		expect(result.current.dirty).toBe(false);
	});

	it("stays dirty and exposes saveError when async onCommit rejects", async () => {
		const onCommit = vi.fn().mockRejectedValue(new Error("api down"));
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], onCommit),
		);
		act(() => result.current.apply([]));
		await act(async () => result.current.save());
		expect(result.current.dirty).toBe(true);
		expect(result.current.saveError).toBeInstanceOf(Error);
	});

	it("discard restores the schema prop", () => {
		const { result } = renderHook(() =>
			useSpecDraft([f("a"), f("b")], [textPlugin], vi.fn()),
		);
		act(() => result.current.apply(removeField(result.current.draft, "b")));
		act(() => result.current.discard());
		expect(result.current.draft).toHaveLength(2);
		expect(result.current.dirty).toBe(false);
	});

	it("content-equal schema with new identity does NOT reset a dirty draft", () => {
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: [f("a")] as Schema } },
		);
		act(() => result.current.apply([]));
		rerender({ schema: [f("a")] }); // fresh array, same content
		expect(result.current.draft).toHaveLength(0);
		expect(result.current.dirty).toBe(true);
	});

	it("content-changed schema resets a CLEAN draft", () => {
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: [f("a")] as Schema } },
		);
		rerender({ schema: [f("x")] });
		expect(result.current.draft[0].config.api_accessor).toBe("x");
		expect(result.current.dirty).toBe(false);
	});

	it("content-changed schema KEEPS a dirty draft (work survives a refetch)", () => {
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: [f("a")] as Schema } },
		);
		act(() => result.current.apply([f("a"), f("mine")]));
		rerender({ schema: [f("x")] });
		expect(result.current.draft.map((x) => x.config.api_accessor)).toEqual(["a", "mine"]);
		expect(result.current.dirty).toBe(true);
	});

	it("save is a no-op while the draft is invalid", () => {
		const onCommit = vi.fn();
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], onCommit),
		);
		act(() => result.current.apply([f("dup"), f("dup")]));
		expect(result.current.validation.valid).toBe(false);
		act(() => result.current.save());
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("notifies onDirtyChange", () => {
		const onDirty = vi.fn();
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], vi.fn(), onDirty),
		);
		act(() => result.current.apply([]));
		expect(onDirty).toHaveBeenLastCalledWith(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/editor/__tests__/use-spec-draft.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — `src/editor/use-spec-draft.ts`:

```ts
// src/editor/use-spec-draft.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { partitionSchemaBySections, type SpecPartition } from "../schema/partition";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import { type SpecValidationResult, validateSpec } from "../schema/validate-spec";

export interface SpecDraft {
	draft: Schema;
	partition: SpecPartition;
	validation: SpecValidationResult;
	dirty: boolean;
	apply: (next: Schema) => void;
	save: () => Promise<void>;
	saving: boolean;
	saveError: unknown | null;
	discard: () => void;
}

export function useSpecDraft(
	schema: Schema,
	plugins: FieldTypePlugin[],
	onCommit: (schema: Schema) => void | Promise<void>,
	onDirtyChange?: (dirty: boolean) => void,
): SpecDraft {
	const [baseline, setBaseline] = useState<Schema>(schema);
	const [draft, setDraft] = useState<Schema>(schema);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<unknown | null>(null);

	// Reset guard: a new prop identity with EQUAL content is ignored
	// (consumers may build fresh arrays every render). Genuinely new
	// content adopts the new baseline, but a dirty draft is KEPT — an
	// author's in-progress work must survive a background refetch.
	useEffect(() => {
		if (schema === baseline) return;
		if (JSON.stringify(schema) === JSON.stringify(baseline)) return;
		const wasDirty = draft !== baseline;
		setBaseline(schema);
		if (!wasDirty) setDraft(schema);
		// biome-ignore lint/correctness/useExhaustiveDependencies: guard reads draft/baseline but must run only on prop change
	}, [schema]);

	const partition = useMemo(() => partitionSchemaBySections(draft), [draft]);
	const pluginMap = useMemo(() => new Map(plugins.map((p) => [p.id, p])), [plugins]);
	const validation = useMemo(() => validateSpec(draft, pluginMap), [draft, pluginMap]);

	const dirty = draft !== baseline;

	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);

	const apply = useCallback((next: Schema) => {
		setSaveError(null);
		setDraft(next);
	}, []);

	const save = useCallback(async () => {
		if (!validation.valid || saving) return;
		setSaving(true);
		setSaveError(null);
		try {
			await onCommit(draft);
			setBaseline(draft); // advance ONLY on success
		} catch (error) {
			setSaveError(error);
		} finally {
			setSaving(false);
		}
	}, [draft, validation.valid, saving, onCommit]);

	const discard = useCallback(() => {
		setSaveError(null);
		setDraft(baseline);
	}, [baseline]);

	return { draft, partition, validation, dirty, apply, save, saving, saveError, discard };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/editor/__tests__/use-spec-draft.test.tsx` → 9 PASS.

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/use-spec-draft.ts src/editor/__tests__/use-spec-draft.test.tsx
git commit -m "feat(editor): useSpecDraft session hook"
```

---

### Task 4: `FieldShell`

**Files:**
- Create: `src/editor/field-shell.tsx`
- Create: `src/editor/__tests__/field-shell.test.tsx`

**Interfaces:**
- Consumes: dnd-kit `useSortable` (same as old SortableFieldItem); `IconButton` from `@knkcs/anker/atoms`; `Tooltip` from `@knkcs/anker/primitives`; lucide icons `GripVertical, Pencil, Copy, Trash2`.
- Produces (used by T5):

```tsx
export interface FieldShellToolbarLabels {
	drag: string; edit: string; duplicate: string; delete: string; systemLocked: string;
}
export interface FieldShellProps {
	field: Field;
	selected: boolean;
	invalid?: boolean;              // danger outline (wired in T10)
	onSelect: (accessor: string) => void;
	onEdit: (accessor: string) => void;      // select + focus panel label
	onDuplicate: (accessor: string) => void;
	onDelete: (accessor: string) => void;
	moveMenu?: ReactNode;           // "Move to section…" node, injected by the canvas (T8)
	labels: FieldShellToolbarLabels;
	children: ReactNode;            // the real field component, rendered inert
}
export function FieldShell(props: FieldShellProps): JSX.Element;
```

Behavior: root `Box` is **keyboard-selectable** — `role="button"`, `tabIndex={0}`, `onKeyDown` handling Enter/Space → `onSelect(accessor)` (preventDefault on Space), plus `onClick`; `data-testid={"shell-" + accessor}`; the children wrapper gets `pointerEvents="none"` + `aria-hidden` (content is display-only); when `selected`, root gets `borderColor="accent"` 2px outline, `bg="bg-subtle"`, and a floating toolbar (absolute, top-right) with the IconButtons (drag handle carries `{...attributes} {...listeners}` from `useSortable`); when `invalid`, border uses `danger.600` (invalid wins over selected). **System fields** (`field.system`): no delete button; a lucide `Lock` icon (aria-label `labels.systemLocked`) renders before the toolbar buttons. Toolbar buttons `size="2xs"` `variant="ghost"`, each in a `Tooltip content=…` using the `labels` strings for both tooltip content and `aria-label`; clicks call their callback with the accessor and `stopPropagation()`.

- [ ] **Step 1: Write the failing tests** — `src/editor/__tests__/field-shell.test.tsx` (wrap renders in `ChakraProvider value={defaultSystem}` + a `DndContext`/`SortableContext` from dnd-kit — `useSortable` needs the contexts):

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Field } from "../../schema/types";
import { FieldShell } from "../field-shell";

const field: Field = {
	field_type: "text",
	config: { name: "Title", api_accessor: "title", required: false, instructions: "" },
	settings: null, system: false,
};

function Wrap({ children }: { children: ReactNode }) {
	return (
		<ChakraProvider value={defaultSystem}>
			<DndContext>
				<SortableContext items={["title"]}>{children}</SortableContext>
			</DndContext>
		</ChakraProvider>
	);
}

const noop = () => {};
const shellLabels = {
	drag: "Drag to reorder", edit: "Edit field", duplicate: "Duplicate field",
	delete: "Delete field", systemLocked: "System field",
};

describe("FieldShell", () => {
	it("renders children inert (aria-hidden wrapper)", () => {
		render(
			<Wrap>
				<FieldShell field={field} selected={false} onSelect={noop} onEdit={noop} onDuplicate={noop} onDelete={noop} labels={shellLabels}>
					<input data-testid="inner" />
				</FieldShell>
			</Wrap>,
		);
		const inner = screen.getByTestId("inner");
		expect(inner.closest("[aria-hidden='true']")).not.toBeNull();
	});

	it("click selects", () => {
		const onSelect = vi.fn();
		render(
			<Wrap>
				<FieldShell field={field} selected={false} onSelect={onSelect} onEdit={noop} onDuplicate={noop} onDelete={noop} labels={shellLabels}>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		fireEvent.click(screen.getByTestId("shell-title"));
		expect(onSelect).toHaveBeenCalledWith("title");
	});

	it("shows the toolbar only when selected; actions fire without re-selecting", () => {
		const onDelete = vi.fn();
		const onSelect = vi.fn();
		const { rerender } = render(
			<Wrap>
				<FieldShell field={field} selected={false} onSelect={onSelect} onEdit={noop} onDuplicate={noop} onDelete={onDelete} labels={shellLabels}>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		expect(screen.queryByLabelText("Delete field")).not.toBeInTheDocument();
		rerender(
			<Wrap>
				<FieldShell field={field} selected onSelect={onSelect} onEdit={noop} onDuplicate={noop} onDelete={onDelete} labels={shellLabels}>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		fireEvent.click(screen.getByLabelText("Delete field"));
		expect(onDelete).toHaveBeenCalledWith("title");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("is keyboard-selectable (Enter and Space)", () => {
		const onSelect = vi.fn();
		render(
			<Wrap>
				<FieldShell field={field} selected={false} onSelect={onSelect} onEdit={noop} onDuplicate={noop} onDelete={noop} labels={shellLabels}>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		const shell = screen.getByTestId("shell-title");
		expect(shell).toHaveAttribute("tabindex", "0");
		fireEvent.keyDown(shell, { key: "Enter" });
		fireEvent.keyDown(shell, { key: " " });
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	it("system fields show a lock and no delete button", () => {
		render(
			<Wrap>
				<FieldShell field={{ ...field, system: true }} selected onSelect={noop} onEdit={noop} onDuplicate={noop} onDelete={noop} labels={shellLabels}>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		expect(screen.getByLabelText("System field")).toBeInTheDocument();
		expect(screen.queryByLabelText("Delete field")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/editor/__tests__/field-shell.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — `src/editor/field-shell.tsx`:

```tsx
// src/editor/field-shell.tsx
import { Box, Flex } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconButton } from "@knkcs/anker/atoms";
import { Tooltip } from "@knkcs/anker/primitives";
import { Copy, GripVertical, Lock, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Field } from "../schema/types";

export interface FieldShellToolbarLabels {
	drag: string;
	edit: string;
	duplicate: string;
	delete: string;
	systemLocked: string;
}

export interface FieldShellProps {
	field: Field;
	selected: boolean;
	invalid?: boolean;
	onSelect: (accessor: string) => void;
	onEdit: (accessor: string) => void;
	onDuplicate: (accessor: string) => void;
	onDelete: (accessor: string) => void;
	moveMenu?: ReactNode;
	labels: FieldShellToolbarLabels;
	children: ReactNode;
}

export function FieldShell({
	field,
	selected,
	invalid,
	onSelect,
	onEdit,
	onDuplicate,
	onDelete,
	moveMenu,
	labels,
	children,
}: FieldShellProps) {
	const accessor = field.config.api_accessor;
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: accessor });

	const borderColor = invalid ? "danger.600" : selected ? "accent" : "transparent";

	return (
		<Box
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			position="relative"
			borderWidth="2px"
			borderColor={borderColor}
			borderRadius="md"
			bg={selected ? "bg-subtle" : undefined}
			opacity={isDragging ? 0.6 : 1}
			p="2"
			cursor="pointer"
			role="button"
			tabIndex={0}
			aria-label={field.config.name}
			data-testid={`shell-${accessor}`}
			onClick={() => onSelect(accessor)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(accessor);
				}
			}}
		>
			{selected && (
				<Flex
					position="absolute"
					top="-4"
					right="2"
					gap="0.5"
					bg="bg-surface"
					borderWidth="1px"
					borderColor="border"
					borderRadius="md"
					boxShadow="sm"
					zIndex="docked"
					onClick={(e) => e.stopPropagation()}
				>
					{field.system && (
						<Box as="span" color="fg.muted" px="1" aria-label={labels.systemLocked} role="img">
							<Lock size={12} />
						</Box>
					)}
					<Tooltip content={labels.drag}>
						<IconButton aria-label={labels.drag} size="2xs" variant="ghost" {...attributes} {...listeners}>
							<GripVertical size={14} />
						</IconButton>
					</Tooltip>
					<Tooltip content={labels.edit}>
						<IconButton aria-label={labels.edit} size="2xs" variant="ghost" onClick={() => onEdit(accessor)}>
							<Pencil size={14} />
						</IconButton>
					</Tooltip>
					<Tooltip content={labels.duplicate}>
						<IconButton aria-label={labels.duplicate} size="2xs" variant="ghost" onClick={() => onDuplicate(accessor)}>
							<Copy size={14} />
						</IconButton>
					</Tooltip>
					{moveMenu}
					{!field.system && (
						<Tooltip content={labels.delete}>
							<IconButton aria-label={labels.delete} size="2xs" variant="ghost" colorPalette="red" onClick={() => onDelete(accessor)}>
								<Trash2 size={14} />
							</IconButton>
						</Tooltip>
					)}
				</Flex>
			)}
			{/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: content is display-only; tabIndex removed via inert wrapper */}
			<Box aria-hidden="true" pointerEvents="none" userSelect="none">
				{children}
			</Box>
		</Box>
	);
}
FieldShell.displayName = "FieldShell";
```

(If Biome flags a different a11y rule name, use the reported rule in the ignore comment — the intent line stays.)

- [ ] **Step 4: Run tests** — `npx vitest run src/editor/__tests__/field-shell.test.tsx` → 5 PASS.

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/field-shell.tsx src/editor/__tests__/field-shell.test.tsx
git commit -m "feat(editor): FieldShell with selection toolbar and inert content"
```

---

### Task 5: `EditorCanvas` core

**Files:**
- Modify: `src/renderer/field-component.tsx:48-54` (memo comparator — see Step 0)
- Modify: `src/renderer/__tests__/field-component.test.tsx` (memo test)
- Create: `src/editor/editor-canvas.tsx`
- Create: `src/editor/__tests__/editor-canvas.test.tsx`
- Create: `src/editor/__tests__/editor-helpers.tsx` (shared test fixtures for T5–T12; NOT named `*.test.tsx`)

- [ ] **Step 0 (sanctioned renderer change): identity-based `FieldComponent` memo.** The current comparator (`field-component.tsx:48-54`) compares only `api_accessor` + `field_type` + `readOnly` — panel edits to name/required/settings produce a new `Field` with the same accessor, so the canvas would NEVER re-render and live preview is dead. Replace the custom comparator:

```tsx
export const FieldComponent = memo(FieldComponentInner, (prev, next) => {
	// Identity comparison: draft-ops replace only the edited field object,
	// so exactly the edited field re-renders. Renderer consumers pass
	// stable field objects and are unaffected.
	return prev.field === next.field && prev.readOnly === next.readOnly;
});
```

TDD: first add a failing test to `src/renderer/__tests__/field-component.test.tsx` — render a FieldComponent, rerender with a NEW field object (same accessor/type, different `config.name`), assert the rendered output shows the new name (with the old comparator it shows the stale one). Run the whole renderer suite afterwards — SpecForm/FieldRenderer pass stable objects, nothing else may regress. Commit separately: `fix(renderer): identity-based FieldComponent memo for editable fields`.

**Interfaces:**
- Consumes: `SpecDraft` (T3), `FieldShell` (T4), `partition` from the draft, `FieldComponent` from `../renderer/field-component` (renders plugin components + error boundary + hidden-check — reuse it; its memo becomes identity-based in Step 0), `Tabs` from `@knkcs/anker/primitives`, `FieldSearch` from `../renderer/spec-form/field-search` (the editor builds its own index — hidden fields included), `useContainerOrientation` from `../renderer/spec-form/use-container-orientation`.
- Produces (used by T12):

```tsx
export interface EditorCanvasProps {
	spec: SpecDraft;                       // the whole draft session object
	selectedAccessor: string | null;
	onSelect: (accessor: string | null) => void;
	onEdit: (accessor: string) => void;
	labels: Required<EditorLabels>;        // defined in T12; T5 uses defaultTab/searchPlaceholder/noResults only — accept a structural subset:
}
```

For T5, type the labels param as the `CanvasLabels` interface shown in the implementation (defaultTab/searchPlaceholder/noResults/hiddenField/groupPreview + `shell: FieldShellToolbarLabels`) — T12 builds this object from its flat `EditorLabels`.

Behavior in this task (affordances come later): renders one scratch `useForm` + `FormProvider` + `FieldKitProvider` passthrough is NOT needed (consumer provides it — canvas assumes it exists, same as FieldRenderer); tab strip when `partition.hasSections` (active tab state, value convention `tab-${i}`, mounted-hidden panels — copy the conventions from `SpecFormTabs`), flat stack otherwise; every non-hidden field renders `<FieldShell><FieldComponent field={field}/></FieldShell>` inside a `Stack gap="5"`; hidden fields render a collapsed shell variant: same FieldShell but children replaced by a muted one-line `<Text color="fg.muted">Hidden field: {name}</Text>` (authors must be able to select hidden fields — they are invisible in SpecForm but must be editable here); `FieldSearch` in the strip (jump = switch tab + `onSelect(accessor)`); duplicate/delete wired to draft-ops through `spec.apply`.

The scratch form: `useForm({ defaultValues: getDefaultValues(spec.draft) })`, re-`reset` when `spec.draft` changes (effect), so default values preview correctly.

- [ ] **Step 1: Create shared fixtures** — `src/editor/__tests__/editor-helpers.tsx`:

```tsx
// src/editor/__tests__/editor-helpers.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { z } from "zod";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { FieldKitProvider } from "../../renderer/provider";

export function makeField(accessor: string, name = accessor): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null, system: false,
	};
}

export function makeSection(accessor: string, name = accessor): Field {
	return {
		field_type: "section",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {}, system: false,
	};
}

function TestField({ field }: FieldProps) {
	return <input data-testid={`field-${field.config.api_accessor}`} aria-label={field.config.name} />;
}

export const testPlugins: FieldTypePlugin[] = [
	{
		id: "text", name: "Text", description: "Plain text", icon: () => null, category: "text",
		fieldComponent: TestField, toZodType: () => z.string(),
	},
	{
		id: "section", name: "Section", description: "Structural", icon: () => null, category: "structural",
		fieldComponent: () => null, toZodType: () => z.never(),
	},
];

export function EditorWrap({ children }: { children: ReactNode }) {
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={testPlugins}>{children}</FieldKitProvider>
		</ChakraProvider>
	);
}
```

- [ ] **Step 2: Write the failing tests** — `src/editor/__tests__/editor-canvas.test.tsx`. Drive the canvas through a tiny harness owning `useSpecDraft`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { useSpecDraft } from "../use-spec-draft";
import { EditorWrap, makeField, makeSection, testPlugins } from "./editor-helpers";

const LABELS = {
	defaultTab: "General", searchPlaceholder: "Find field…", noResults: "No fields found",
	hiddenField: "Hidden field:", groupPreview: "Repeating group",
	shell: {
		drag: "Drag to reorder", edit: "Edit field", duplicate: "Duplicate field",
		delete: "Delete field", systemLocked: "System field",
	},
};

function Harness({ schema, onCommit = vi.fn() }: { schema: Schema; onCommit?: (s: Schema) => void }) {
	const spec = useSpecDraft(schema, testPlugins, onCommit);
	const [selected, setSelected] = useState<string | null>(null);
	return (
		<EditorCanvas
			spec={spec}
			selectedAccessor={selected}
			onSelect={setSelected}
			onEdit={setSelected}
			labels={LABELS}
		/>
	);
}

describe("EditorCanvas", () => {
	it("renders real field components inside shells, flat when sectionless", () => {
		render(<EditorWrap><Harness schema={[makeField("a"), makeField("b")]} /></EditorWrap>);
		expect(screen.getByTestId("shell-a")).toBeInTheDocument();
		expect(screen.getByTestId("field-a")).toBeInTheDocument();
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
	});

	it("renders tabs for sectioned schemas with mounted-hidden panels", () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeSection("s1", "SEO"), makeField("b")]} />
			</EditorWrap>,
		);
		expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(
			expect.arrayContaining([expect.stringContaining("General"), expect.stringContaining("SEO")]),
		);
		expect(screen.getByTestId("shell-b")).toBeInTheDocument(); // mounted though inactive
	});

	it("click selects a shell; delete removes the field from the draft", async () => {
		render(<EditorWrap><Harness schema={[makeField("a"), makeField("b")]} /></EditorWrap>);
		fireEvent.click(screen.getByTestId("shell-a"));
		fireEvent.click(await screen.findByLabelText("Delete field"));
		expect(screen.queryByTestId("shell-a")).not.toBeInTheDocument();
		expect(screen.getByTestId("shell-b")).toBeInTheDocument();
	});

	it("duplicate inserts a copy right after with uniquified accessor", async () => {
		render(<EditorWrap><Harness schema={[makeField("a")]} /></EditorWrap>);
		fireEvent.click(screen.getByTestId("shell-a"));
		fireEvent.click(await screen.findByLabelText("Duplicate field"));
		expect(screen.getByTestId("shell-a_copy")).toBeInTheDocument();
	});

	it("renders hidden fields as selectable muted rows", () => {
		const hidden = makeField("h");
		hidden.config.hidden = true;
		render(<EditorWrap><Harness schema={[hidden]} /></EditorWrap>);
		expect(screen.getByTestId("shell-h")).toBeInTheDocument();
		expect(screen.getByText(/Hidden field/)).toBeInTheDocument();
		expect(screen.queryByTestId("field-h")).not.toBeInTheDocument();
	});

	it("field search jumps tabs and selects", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeSection("s1", "SEO"), makeField("meta", "Meta description")]} />
			</EditorWrap>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), { target: { value: "meta" } });
		const option = await screen.findByRole("option");
		await act(async () => { fireEvent.click(option); });
		expect(screen.getByTestId("shell-meta").closest("[role='tabpanel']")).not.toHaveAttribute("hidden");
	});
});
```

- [ ] **Step 3: Run tests to verify they fail** — `npx vitest run src/editor/__tests__/editor-canvas.test.tsx` → FAIL.

- [ ] **Step 4: Implement** — `src/editor/editor-canvas.tsx`:

```tsx
// src/editor/editor-canvas.tsx
import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { Tabs } from "@knkcs/anker/primitives";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldComponent } from "../renderer/field-component";
import { FieldSearch } from "../renderer/spec-form/field-search";
import { useContainerOrientation } from "../renderer/spec-form/use-container-orientation";
import type { FieldShellToolbarLabels } from "./field-shell";
import { getDefaultValues } from "../schema/zod-builder";
import type { Field } from "../schema/types";
import { duplicateField, removeField } from "./draft-ops";
import { FieldShell } from "./field-shell";
import type { SpecDraft } from "./use-spec-draft";

interface CanvasLabels {
	defaultTab: string;
	searchPlaceholder: string;
	noResults: string;
	hiddenField: string;   // e.g. "Hidden field:" prefix
	groupPreview: string;  // e.g. "Repeating group" — child count appended
	shell: FieldShellToolbarLabels;
}

export interface EditorCanvasProps {
	spec: SpecDraft;
	selectedAccessor: string | null;
	onSelect: (accessor: string | null) => void;
	onEdit: (accessor: string) => void;
	labels: CanvasLabels;
}

function ShellContent({ field, labels }: { field: Field; labels: CanvasLabels }) {
	if (field.config.hidden) {
		return (
			<Text fontSize="sm" color="fg.muted" fontStyle="italic">
				{labels.hiddenField} {field.config.name}
			</Text>
		);
	}
	if (field.field_type === "group") {
		// The real GroupField renders an empty useFieldArray state that reads
		// as broken in an inert canvas — show the spec's framed preview instead.
		const childCount = (field.children ?? []).length;
		return (
			<Box borderWidth="1px" borderStyle="dashed" borderColor="border" borderRadius="md" p="3">
				<Text fontSize="sm" fontWeight="medium">{field.config.name}</Text>
				<Text fontSize="xs" color="fg.muted">
					{labels.groupPreview} · {childCount}
				</Text>
			</Box>
		);
	}
	return <FieldComponent field={field} />;
}
ShellContent.displayName = "ShellContent";

export function EditorCanvas({
	spec,
	selectedAccessor,
	onSelect,
	onEdit,
	labels,
}: EditorCanvasProps) {
	const { partition, draft, apply } = spec;
	const [activeTab, setActiveTab] = useState("tab-0");
	const { orientation, containerRef } = useContainerOrientation(partition.orientation);

	// Scratch form so real field components render authentic defaults.
	const methods = useForm({ defaultValues: getDefaultValues(draft) });
	// Reset ONLY when the defaults actually changed — a per-keystroke reset
	// would re-render every registered field (incl. heavy ones like TipTap).
	const lastDefaultsRef = useRef(JSON.stringify(getDefaultValues(draft)));
	// biome-ignore lint/correctness/useExhaustiveDependencies: guarded by content comparison
	useEffect(() => {
		const next = getDefaultValues(draft);
		const serialized = JSON.stringify(next);
		if (serialized !== lastDefaultsRef.current) {
			lastDefaultsRef.current = serialized;
			methods.reset(next);
		}
	}, [draft]);

	useEffect(() => {
		setActiveTab("tab-0");
	}, [partition.tabs.length === 0]); // reset only when tab count crosses zero is wrong — see note below

	// Editor-side index: unlike the renderer's buildSearchIndex, HIDDEN fields
	// are included — they render as selectable rows on the canvas.
	const searchIndex = useMemo(
		() =>
			partition.tabs.flatMap((tab, tabIndex) =>
				tab.fields.map((field) => ({
					accessor: field.config.api_accessor,
					label: field.config.name,
					tabIndex,
					tabLabel: tab.section?.config.name ?? labels.defaultTab,
				})),
			),
		[partition, labels.defaultTab],
	);

	const invalidAccessors = useMemo(
		() => new Set(spec.validation.fieldErrors.map((e) => e.accessor)),
		[spec.validation],
	);

	const handleDelete = (accessor: string) => {
		if (selectedAccessor === accessor) onSelect(null);
		apply(removeField(draft, accessor));
	};
	const handleDuplicate = (accessor: string) => apply(duplicateField(draft, accessor));

	const renderFields = (fields: Field[]) => (
		<Stack gap="5">
			{fields.map((field) => (
				<FieldShell
					key={field.config.api_accessor}
					field={field}
					selected={selectedAccessor === field.config.api_accessor}
					invalid={invalidAccessors.has(field.config.api_accessor)}
					onSelect={(a) => onSelect(a)}
					onEdit={onEdit}
					onDuplicate={handleDuplicate}
					onDelete={handleDelete}
					labels={labels.shell}
				>
					<ShellContent field={field} labels={labels} />
				</FieldShell>
			))}
		</Stack>
	);

	if (partition.tabs.length === 0) {
		return (
			<FormProvider {...methods}>
				<Box data-testid="editor-canvas-empty" color="fg.muted" p="6" textAlign="center">
					{/* empty-spec drop zone arrives with insertion (T6) */}
				</Box>
			</FormProvider>
		);
	}

	if (!partition.hasSections) {
		return (
			<FormProvider {...methods}>
				<Box ref={containerRef}>{renderFields(partition.tabs[0].fields)}</Box>
			</FormProvider>
		);
	}

	return (
		<FormProvider {...methods}>
			<Box ref={containerRef}>
				<Tabs.Root value={activeTab} onValueChange={(e) => setActiveTab(e.value)} orientation={orientation}>
					<Flex align="center" justify="space-between" gap="4">
						<Tabs.List flex="1">
							{partition.tabs.map((tab, i) => (
								<Tabs.Trigger key={tab.section?.config.api_accessor ?? `implicit-${i}`} value={`tab-${i}`}>
									{tab.section?.config.name ?? labels.defaultTab}
								</Tabs.Trigger>
							))}
						</Tabs.List>
						<FieldSearch
							index={searchIndex}
							placeholder={labels.searchPlaceholder}
							noResultsLabel={labels.noResults}
							onJump={(r) => {
								setActiveTab(`tab-${r.tabIndex}`);
								onSelect(r.accessor);
							}}
						/>
					</Flex>
					{partition.tabs.map((tab, i) => (
						<Tabs.Content key={tab.section?.config.api_accessor ?? `implicit-${i}`} value={`tab-${i}`}>
							<Box pt="4">{renderFields(tab.fields)}</Box>
						</Tabs.Content>
					))}
				</Tabs.Root>
			</Box>
		</FormProvider>
	);
}
EditorCanvas.displayName = "EditorCanvas";
```

Fix the marked wrong effect before running: reset the active tab when the draft's *tab count shrinks below the active index* (deleting sections) — implement as:

```tsx
	useEffect(() => {
		const activeIndex = Number(activeTab.replace("tab-", ""));
		if (activeIndex >= partition.tabs.length) setActiveTab("tab-0");
	}, [partition.tabs.length, activeTab]);
```

Do NOT reset on every draft change (unlike SpecForm) — in the editor, edits are constant and must not yank the author back to the first tab.

Note the mounted-panels rule: never pass `lazyMount`/`unmountOnExit` to `Tabs.Root` — search jumps and cross-tab selection need all shells in the DOM (same rationale as SpecForm).

Hidden fields: `FieldComponent` returns `null` for hidden fields, which is why `ShellContent` branches BEFORE delegating.

- [ ] **Step 5: Run tests** — `npx vitest run src/editor/__tests__/editor-canvas.test.tsx` → 6 PASS.

- [ ] **Step 6: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/editor-canvas.tsx src/editor/__tests__/
git commit -m "feat(editor): WYSIWYG canvas with shells, tabs, search"
```

---

### Task 6: insertion points + `TypePickerPopover`

**Files:**
- Create: `src/editor/type-picker-popover.tsx`
- Modify: `src/editor/editor-canvas.tsx` (insertion points between shells + empty states)
- Test: `src/editor/__tests__/insertion.test.tsx` (create)

**Interfaces:**
- Consumes: `TypePicker` (existing, unchanged — `{ plugins, context?, currentSpec?, onSelect(pluginId) }`); `Popover, PopoverTrigger, PopoverContent` from `@knkcs/anker/primitives`; `insertFieldAt`, `uniquifyAccessor` from draft-ops; plugin `defaultSettings`.
- Produces:

```tsx
export interface TypePickerPopoverProps {
	plugins: FieldTypePlugin[];
	context?: FieldContext;
	currentSpec: Schema;
	onPick: (pluginId: string) => void; // parent inserts + selects
	triggerLabel: string;               // aria-label for the ⊕ button
}
export function TypePickerPopover(props: TypePickerPopoverProps): JSX.Element;
```

Canvas addition: between every pair of shells (and at the end of each tab, and as the empty-tab/empty-spec drop zone) render an insertion row: a thin hover-revealed line with a centered ⊕ `TypePickerPopover` trigger (`opacity 0 → 1` on hover via Chakra `_hover` on the row group; always visible when the tab is empty). Picking a type builds the new field:

```ts
const accessor = nextAccessor(draft, plugin.id); // e.g. "text", "text_2"… (numeric — it is not a copy)
const newField: Field = {
	field_type: plugin.id,
	config: { name: plugin.name, api_accessor: accessor, required: false, instructions: "" },
	settings: plugin.defaultSettings ?? null,
	system: false,
};
apply(insertFieldAt(draft, newField, flatIndex));
onSelect(accessor); // parent opens the panel; T9's panel focuses the Label input
```

`flatIndex` for "insert at position k of tab t": index in the flat draft of the k-th field of that tab (or after the section marker / end of the previous block when the tab is empty or k is 0 — compute from the partition by locating the neighbor field/marker in the flat array, the same technique as `moveFieldToSection`). Extract this as `flatInsertIndex(draft, partition, tabIndex, position)` in `draft-ops.ts` **with unit tests** (add to `draft-ops.test.ts`: cases for middle-of-tab, top-of-tab, empty tab, sectionless schema, empty schema → 0).

- [ ] **Step 1: Write failing tests** — `src/editor/__tests__/insertion.test.tsx` (reuse `Harness` pattern from T5's test — import `EditorWrap`, `makeField`, `makeSection`, `testPlugins` from `./editor-helpers`; the harness is small, duplicate it locally):

```tsx
// key cases:
it("empty spec shows an always-visible insertion point", …
	render Harness with schema=[] → screen.getByLabelText("Add field") present);
it("picking a type inserts at that position and selects it", …
	render Harness with [makeField("a"), makeField("b")];
	open the insertion point between a and b (getAllByLabelText("Add field")[1]);
	await screen.findByTestId("type-option-text") → fireEvent.click;
	expect shells order a, text, b — assert via the flat DOM order of data-testid^="shell-";
	expect the new shell to have the selected outline (toolbar visible: getByLabelText("Delete field")));
it("empty tab shows its insertion point", …
	schema=[makeSection("s1","SEO")] → switch to SEO tab (act+click) → getByLabelText("Add field"));
```

Write these three tests in full (follow T5's harness verbatim; assertions as sketched — DOM order via `container.querySelectorAll('[data-testid^="shell-"]')`).

- [ ] **Step 2: Run to verify failing** — `npx vitest run src/editor/__tests__/insertion.test.tsx` → FAIL.

- [ ] **Step 3: Implement `flatInsertIndex` in draft-ops (+ its unit tests in draft-ops.test.ts), then `TypePickerPopover`:**

```tsx
// src/editor/type-picker-popover.tsx
import { Box } from "@chakra-ui/react";
import { IconButton } from "@knkcs/anker/atoms";
import { Popover, PopoverContent, PopoverTrigger } from "@knkcs/anker/primitives";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { FieldContext, FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import { TypePicker } from "./type-picker";

export interface TypePickerPopoverProps {
	plugins: FieldTypePlugin[];
	context?: FieldContext;
	currentSpec: Schema;
	onPick: (pluginId: string) => void;
	triggerLabel: string;
}

export function TypePickerPopover({
	plugins,
	context,
	currentSpec,
	onPick,
	triggerLabel,
}: TypePickerPopoverProps) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={(e) => setOpen(e.open)}>
			<PopoverTrigger asChild>
				<IconButton aria-label={triggerLabel} size="2xs" variant="ghost" colorPalette="primary">
					<Plus size={14} />
				</IconButton>
			</PopoverTrigger>
			<PopoverContent minWidth="sm" maxHeight="20rem" overflowY="auto">
				<Box p="2">
					<TypePicker
						plugins={plugins}
						context={context}
						currentSpec={currentSpec}
						onSelect={(id) => {
							setOpen(false);
							onPick(id);
						}}
					/>
				</Box>
			</PopoverContent>
		</Popover>
	);
}
TypePickerPopover.displayName = "TypePickerPopover";
```

(Verify `Popover`'s controlled-open prop shape against `@knkcs/anker/dist/primitives/index.d.ts` — it is Chakra v3's `Popover.RootProps`, so `open`/`onOpenChange({open})` is correct.)

Then wire insertion rows into `renderFields` in `editor-canvas.tsx` — the canvas gains `plugins` and `context` props (add to `EditorCanvasProps`; the T5 test harness passes `testPlugins`):

```tsx
	const insertAt = (tabIndex: number, position: number) => (pluginId: string) => {
		const plugin = plugins.find((p) => p.id === pluginId);
		if (!plugin) return;
		const accessor = nextAccessor(draft, plugin.id);
		const newField: Field = {
			field_type: plugin.id,
			config: { name: plugin.name, api_accessor: accessor, required: false, instructions: "" },
			settings: plugin.defaultSettings ?? null,
			system: false,
		};
		apply(insertFieldAt(draft, newField, flatInsertIndex(draft, partition, tabIndex, position)));
		onSelect(accessor);
	};

	const insertionRow = (tabIndex: number, position: number, alwaysVisible: boolean) => (
		<Flex
			key={`insert-${tabIndex}-${position}`}
			role="group"
			justify="center"
			align="center"
			height="6"
			opacity={alwaysVisible ? 1 : 0}
			_hover={{ opacity: 1 }}
			transition="opacity 0.15s"
		>
			<TypePickerPopover
				plugins={plugins}
				context={context}
				currentSpec={draft}
				onPick={insertAt(tabIndex, position)}
				triggerLabel={labels.addField}
			/>
		</Flex>
	);
```

`renderFields(fields, tabIndex)` interleaves: `insertionRow(tabIndex, 0, fields.length === 0)`, then for each field `[shell, insertionRow(tabIndex, i+1, false)]`. The empty-spec branch renders a labeled empty state instead of the placeholder Box: a centered `<Text color="fg.muted">{labels.emptySpec}</Text>` above `insertionRow(0, 0, true)` (CanvasLabels gains `addField: string` and `emptySpec: string` — e.g. "No fields yet. Add the first one:"). Empty plugin registry / fully filtered context: TypePicker already renders its "no matching" message — verify it appears inside the popover and reads sensibly with an empty search.

- [ ] **Step 4: Run tests** — `npx vitest run src/editor/__tests__/insertion.test.tsx src/editor/__tests__/editor-canvas.test.tsx src/editor/__tests__/draft-ops.test.ts` → PASS (T5 tests updated only by adding the new required `plugins` prop to the harness).

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/
git commit -m "feat(editor): inline insertion points with type-picker popover"
```

---

### Task 7: section strip editing

**Files:**
- Create: `src/editor/section-menu.tsx`
- Modify: `src/editor/editor-canvas.tsx` (menu on triggers, "+ Section" button)
- Test: `src/editor/__tests__/sections.test.tsx` (create)

**Interfaces:**
- Consumes: `MenuRoot, MenuTrigger, MenuContent, MenuItem` from `@knkcs/anker/primitives`; `useConfirmModal` from `@knkcs/anker/feedback` (tests wrap in `ConfirmModalProvider`); draft-ops section functions (T2).
- Produces:

```tsx
export interface SectionMenuProps {
	sectionAccessor: string;
	sectionName: string;
	isFirst: boolean;                  // orientation item only on the first section
	orientation: "horizontal" | "vertical";
	onRename: (accessor: string, name: string) => void;
	onMove: (accessor: string, direction: -1 | 1) => void;
	onDelete: (accessor: string) => void;      // caller confirms
	onOrientation: (o: "horizontal" | "vertical") => void;
	labels: { renameSection: string; moveLeft: string; moveRight: string; deleteSection: string; orientationH: string; orientationV: string };
}
```

Rename: the MenuItem switches the tab label into an inline `<Input size="xs">` (local state in the canvas: `renamingAccessor`); Enter/blur commits via `onRename`, Escape cancels. Delete: canvas calls `const ok = await confirm({ title: labels.deleteSection, message: labels.deleteSectionConfirm.replace("{section}", sectionName), colorPalette: "red" }); if (ok) apply(deleteSection(draft, accessor))`. The default `deleteSectionConfirm` text MUST say the fields survive: "Delete section \"{section}\"? Its fields move to the previous tab." The rename inline input must call `e.stopPropagation()` on its Escape keydown so the shell-deselect document listener (T12) does not also fire. "+ Section": a ghost Button after the last trigger → `apply(addSection(draft, "New section"))` and immediately enter rename mode for it. SpecEditor (T12) must wrap everything in `ConfirmModalProvider` — for now the canvas test provides it.

- [ ] **Step 1: Write failing tests** — `src/editor/__tests__/sections.test.tsx` (harness = T5 pattern + `ConfirmModalProvider` inside `EditorWrap`'s children). Cases, write in full:

```tsx
it("+ Section appends a tab and enters rename mode", …
	schema=[makeField("a")] → click getByText("+ Section") → an input with value "New section" appears;
	type "Details" + Enter → getByRole("tab", { name: /Details/ }) present);
it("rename via menu commits on Enter", …
	schema=[makeSection("s1","SEO"), makeField("b")] → open the SEO tab's menu (getByLabelText("Section menu: SEO")) →
	click "Rename" → input appears prefilled "SEO" → change to "Meta" + Enter → tab shows "Meta");
it("delete section merges fields after confirm", …
	schema=[makeField("a"), makeSection("s1","SEO"), makeField("b")] → SEO menu → Delete → confirm dialog appears →
	click its Confirm button → tablist gone (only implicit tab remains? — with one remaining section-less layout: no tablist) and shell-b still in the document);
it("orientation toggle only on the first section's menu", …
	schema=[makeSection("s1"), makeField("a"), makeSection("s2"), makeField("b")] →
	s1 menu contains "Vertical tabs" item; s2 menu does not;
	click it → getByRole("tablist") has aria-orientation="vertical");
```

- [ ] **Step 2: Run to verify failing.**

- [ ] **Step 3: Implement** `section-menu.tsx`:

```tsx
// src/editor/section-menu.tsx
import { IconButton } from "@knkcs/anker/atoms";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@knkcs/anker/primitives";
import { ChevronDown } from "lucide-react";
import type { SectionMenuProps } from "./section-menu-types-see-interfaces-block";

export function SectionMenu({
	sectionAccessor, sectionName, isFirst, orientation,
	onRename, onMove, onDelete, onOrientation, labels,
}: SectionMenuProps) {
	return (
		<MenuRoot>
			<MenuTrigger asChild>
				<IconButton aria-label={`Section menu: ${sectionName}`} size="2xs" variant="ghost">
					<ChevronDown size={12} />
				</IconButton>
			</MenuTrigger>
			<MenuContent>
				<MenuItem value="rename" onClick={() => onRename(sectionAccessor, sectionName)}>
					{labels.renameSection}
				</MenuItem>
				<MenuItem value="move-left" onClick={() => onMove(sectionAccessor, -1)}>
					{labels.moveLeft}
				</MenuItem>
				<MenuItem value="move-right" onClick={() => onMove(sectionAccessor, 1)}>
					{labels.moveRight}
				</MenuItem>
				{isFirst && (
					<MenuItem
						value="orientation"
						onClick={() => onOrientation(orientation === "vertical" ? "horizontal" : "vertical")}
					>
						{orientation === "vertical" ? labels.orientationH : labels.orientationV}
					</MenuItem>
				)}
				<MenuItem value="delete" color="danger.600" onClick={() => onDelete(sectionAccessor)}>
					{labels.deleteSection}
				</MenuItem>
			</MenuContent>
		</MenuRoot>
	);
}
SectionMenu.displayName = "SectionMenu";
```

(Define `SectionMenuProps` in this file — the import line above is illustrative only; the Interfaces block is the contract. `MenuItem` may use `onSelect`/`value` semantics in Chakra v3 — check `@knkcs/anker/dist/primitives/index.d.ts` `MenuItem` = `Menu.ItemProps`; Chakra v3 fires `onClick` on items normally; if clicks don't fire in tests, switch to `MenuRoot onSelect={({value}) => …}` dispatch — both are valid Chakra v3 APIs; keep whichever passes with real interaction.)

Canvas wiring: trigger row becomes `Trigger + SectionMenu` per tab (menu only for real sections, not the implicit tab); rename state `const [renaming, setRenaming] = useState<string | null>(null)` renders an `<Input size="xs" autoFocus defaultValue={name} aria-label="Section name">` in place of the trigger text with Enter/blur→`apply(renameSection(...))` + `setRenaming(null)`, Escape→cancel; "+ Section" ghost button after the List; delete handler uses `useConfirmModal()`.

- [ ] **Step 4: Run tests** — all editor tests → PASS.

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/
git commit -m "feat(editor): in-place section editing on the tab strip"
```

---

### Task 8: drag & drop — reorder + cross-tab move

**Files:**
- Modify: `src/editor/editor-canvas.tsx` (DndContext, droppable tab triggers, "Move to section…")
- Modify: `src/editor/field-shell.tsx` (nothing — handle already wired via `useSortable`)
- Test: `src/editor/__tests__/dnd.test.tsx` (create)

**Interfaces:**
- Consumes: `DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, DragOverEvent, DragEndEvent` from `@dnd-kit/core`; `SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy` from `@dnd-kit/sortable`; `moveField`, `moveFieldToSection` from draft-ops; `MenuRoot/…` for "Move to section…" (submenu inside the FieldShell toolbar — add a fifth toolbar item, a MenuRoot with the section names).
- Produces: within-tab reorder; drop-on-trigger cross-tab move; toolbar "Move to section…" menu.

Implementation notes (write these as code, not prose, when implementing):
- Copy the sensor setup verbatim from the old `spec-editor.tsx` (PointerSensor `activationConstraint: { distance: 8 }`, KeyboardSensor with `sortableKeyboardCoordinates`).
- One `DndContext` around the whole canvas; one `SortableContext` per tab panel with `items` = that tab's accessors, `strategy={verticalListSortingStrategy}`.
- `onDragEnd`: if `over.id` is another field accessor → translate to flat indices in the draft and `apply(moveField(draft, from, to))`. If `over.id` is a tab-trigger droppable id (`tabdrop-${i}`) → `apply(moveFieldToSection(draft, String(active.id), i))`.
- Tab triggers become droppables via `useDroppable({ id: `tabdrop-${i}` })` on a wrapper Box; `onDragOver`: when hovering a `tabdrop-*`, `setActiveTab(`tab-${i}`)` (drag-hover activates the tab so the user can drop inside it).
- Toolbar "Move to section…": fifth icon (lucide `FolderInput`) opening a Menu listing tab labels (excluding the field's current tab); pick → `apply(moveFieldToSection(draft, accessor, i))`. Only rendered when `partition.hasSections`. FieldShell gains an optional `moveMenu?: ReactNode` prop rendered in the toolbar; the canvas builds the menu (keeps FieldShell dumb).

- [ ] **Step 1: Write failing tests** — `src/editor/__tests__/dnd.test.tsx`. jsdom cannot simulate pointer drags reliably — test the ACTION paths and the keyboard sensor:

```tsx
it("Move to section… relocates the field", …
	schema=[makeField("a"), makeSection("s1","SEO"), makeField("b")] →
	select shell-a → open getByLabelText("Move to section") menu → click the "SEO" item →
	switch to SEO tab (act) → both shell-a and shell-b under the active tabpanel);
it("keyboard reorder moves a field down", …
	schema=[makeField("a"), makeField("b")] (sectionless) →
	select shell-a → focus getByLabelText("Drag to reorder") → fireEvent.keyDown(handle, { code: "Space" }) →
	fireEvent.keyDown(handle, { code: "ArrowDown" }) → fireEvent.keyDown(handle, { code: "Space" }) →
	DOM order of shells is b, a);
```

Write both in full using the established harness. (dnd-kit's keyboard sensor listens for `code`-based KeyboardEvents on the активator — if `code` doesn't trigger, use `key: " "` / `key: "ArrowDown"`; verify RED first with the real listener.)

- [ ] **Step 2: Run to verify failing.**

- [ ] **Step 3: Implement per the notes above.** All new canvas code uses draft-ops — no inline array surgery.

- [ ] **Step 4: Run tests** — full editor suite → PASS.

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/
git commit -m "feat(editor): drag reorder and cross-section field moves"
```

---

### Task 9: config panel + panel sections

**Files:**
- Create: `src/editor/panel-sections/config-section.tsx`
- Create: `src/editor/panel-sections/validation-section.tsx`
- Create: `src/editor/panel-sections/settings-section.tsx`
- Create: `src/editor/field-config-panel.tsx`
- Test: `src/editor/__tests__/field-config-panel.test.tsx` (create)

**Interfaces:**
- Consumes: `updateField` (T2); the selected `Field` + its plugin; anker `/forms` inputs are NOT usable here (they require RHF context we don't want in the panel) — use Chakra `Input`, `Textarea`, `Checkbox` via `@chakra-ui/react` with anker tokens, mirroring how `field-modal.tsx` builds controlled inputs today (its state model is the blueprint: see field-modal.tsx:62-132 for the hydration rules and 165-215 for the save shape — the panel reuses those rules but applies **immediately per change** instead of on Save).
- Produces:

```tsx
export interface PanelSectionProps {
	field: Field;
	plugin: FieldTypePlugin | undefined;
	onFieldChange: (next: Field) => void;   // panel → canvas live update
	accessorError: string | null;            // local gate error (see below)
	committedAccessors: Set<string>;         // accessors present in the last committed schema
	labels: PanelLabels;                     // headings + messages (T12 provides; tests pass English)
}
export interface PanelLabels {
	general: string; validation: string; typeSettings: string; noSettings: string;
	children: string; back: string; close: string; localizable: string;
	accessorInUse: string; accessorEmpty: string; committedAccessorWarning: string;
}
export function ConfigSection(props: PanelSectionProps): JSX.Element;    // name, accessor, instructions, required, default, hidden, readOnly (+ name→accessor slugify with manual-edit latch, ported from field-modal.tsx:134-151)
export function ValidationSection(props: PanelSectionProps): JSX.Element; // min/max length, pattern, pattern message, unique
export function SettingsSection(props: PanelSectionProps): JSX.Element;  // plugin.settingsComponent or "No additional settings"

export interface FieldConfigPanelProps {
	field: Field | null;                   // null → panel hidden
	plugin: FieldTypePlugin | undefined;
	fieldErrors: SpecFieldError[];         // from draft validation
	onFieldChange: (next: Field) => void;
	onClose: () => void;
	autoFocusLabel?: boolean;              // set by onEdit / insertion flows
	// group drill-in:
	onSelectChild?: (childAccessor: string) => void; // future-proof; v1 renders children list read-only names + Edit buttons that select the child INTO the panel with a Back control
}
export function FieldConfigPanel(props: FieldConfigPanelProps): JSX.Element | null;
```

Field mutation pattern (each control): build `next: Field` immutably and call `onFieldChange(next)` — e.g. required checkbox: `onFieldChange({ ...field, config: { ...field.config, required: e.target.checked } })`. Validation numbers empty-string → key removed (port the conditional-spread technique from field-modal.tsx:165-215). Sections render inside Chakra `Collapsible`/details-style groups titled via `labels.general` / `labels.validation` / `labels.typeSettings` (General expanded by default).

**Accessor gate (Blocking finding #2 from the design review — the contract):** the accessor input is LOCAL STATE in ConfigSection, synced from `field.config.api_accessor` when the selected field changes. On each keystroke it validates locally: empty → `labels.accessorEmpty`; collides with another field's accessor in the draft → `labels.accessorInUse`. Only a VALID value is applied to the draft (`onFieldChange` with the new accessor); invalid values show the error under the input and never touch the draft — mid-typing collisions can therefore never overwrite another field (updateField matches whole accessors). When the applied accessor changes, the parent (T12) re-syncs its `selected` state in the same `onFieldChange` handler.

**Committed-accessor warning:** when `committedAccessors.has(field.config.api_accessor)` and the input differs from the synced value, render `labels.committedAccessorWarning` ("Changing the accessor of a saved field disconnects its existing data") as a warning-toned helper under the input. New-in-draft fields rename silently.

**Auto-slug latch (baseline-aware):** name→accessor auto-slugify (port from field-modal.tsx:134-151) starts ACTIVE when the field's accessor is NOT in `committedAccessors` (new-in-draft) and the user has not manually edited the accessor; it latches off on manual accessor edit. Committed fields never auto-slug.

**Trim on blur, not on keystroke:** `.trim()` from the FieldModal serialization applies on input blur (and before Save via the draft as-is) — trimming per keystroke makes typing spaces impossible.

**Config parity:** ConfigSection adds a `localizable` checkbox next to hidden/readOnly (`labels.localizable`) — `FieldConfig.localizable` exists but no editor generation has ever exposed it.

Group drill-in (v1, minimal per spec): when `field.field_type === "group"`, panel shows below the standard sections a "Children" list — each child row: name + type + Edit button; Edit swaps the panel to that child (`drillStack` local state; Back button pops). Child edits produce a new children array on the group: `onFieldChange({ ...group, children: children.map(...) })`.

- [ ] **Step 1: Write failing tests** — `src/editor/__tests__/field-config-panel.test.tsx`, full code, cases:

```tsx
it("renders nothing when field is null");
it("label edit calls onFieldChange with updated name (and auto-slugs a fresh accessor for a new-in-draft field)");
it("manual accessor edit latches — subsequent label edits stop touching the accessor");
it("committed fields never auto-slug (accessor in committedAccessors)");
it("colliding accessor edit shows the error and does NOT call onFieldChange");
it("empty accessor shows the error and does NOT call onFieldChange");
it("editing a committed field's accessor shows the disconnect warning");
it("required checkbox toggles config.required");
it("localizable checkbox toggles config.localizable");
it("renders plugin settingsComponent and applies its onChange to field.settings");
it("group children list drills in and edits a child name");
```

(Use `EditorWrap` + a stateful harness holding a `Field` in useState and passing `onFieldChange` = setState; assert on the harness's rendered JSON dump `<pre data-testid="dump">{JSON.stringify(field)}</pre>`.)

- [ ] **Step 2: Run to verify failing.**

- [ ] **Step 3: Implement** the three sections + panel frame. Port the exact hydration/serialization rules from `field-modal.tsx` (lines cited in Interfaces); panel frame is a `Box` column (`bg="bg-subtle"`, `borderLeftWidth="1px"`, `p="4"`, `minWidth="72"`, header row with field name + type + close `X` IconButton, `autoFocusLabel` focuses the Label input in an effect).

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/panel-sections/ src/editor/field-config-panel.tsx src/editor/__tests__/field-config-panel.test.tsx
git commit -m "feat(editor): field config side panel with live updates"
```

---

### Task 10: validation surfacing

**Files:**
- Modify: `src/editor/editor-canvas.tsx` (tab error badges — invalid shells already wired in T5)
- Test: `src/editor/__tests__/validation-surfacing.test.tsx` (create)

**Interfaces:**
- Consumes: `spec.validation.fieldErrors` (T1/T3), partition mapping accessor→tab.
- Produces: tabs containing invalid fields show the same red count badge as SpecForm (`data-testid={"tab-errors-" + i}`, `bg="danger.600"` pill — copy the badge JSX from `src/renderer/spec-form/spec-form.tsx`'s trigger block); shells with errors show the danger outline (already implemented in T5 via `invalid` prop — this task adds the missing piece and tests both).

- [ ] **Step 1: Write failing tests** — full code; cases:

```tsx
it("duplicate accessors put a danger outline on both shells and a badge on their tab", …
	schema with [makeSection("s1"), makeField("x"), makeField("x2")] then panel-less mutation: build the duplicate directly in the schema fixture (two fields with accessor "dup") →
	expect getByTestId("tab-errors-0") textContent "2"? (two fieldErrors for one duplicate pair → the badge shows the number of fieldErrors on that tab; assert ≥1 and outline via border style on shells));
it("valid spec renders no badges");
```

Note: two fields sharing one accessor break React keys (both shells keyed by the same accessor). The canvas must key shells by `${accessor}-${flatIndex}` — this task changes the key and asserts both shells render (getAllByTestId("shell-dup")).

- [ ] **Step 2–4: RED → implement → GREEN** (badge JSX copied from SpecFormTabs trigger; per-tab error count = fieldErrors counted against EVERY tab containing a field with that accessor — a cross-tab duplicate badges both tabs, computed by walking partition.tabs' fields rather than first-occurrence lookup).

- [ ] **Step 5: Full gate + commit**

```bash
git add src/editor/
git commit -m "feat(editor): validation badges and outlines on the canvas"
```

---### Task 11: Try-it mode

**Files:**
- Create: `src/editor/try-it-view.tsx`
- Test: `src/editor/__tests__/try-it.test.tsx` (create)

**Interfaces:**
- Consumes: `SpecForm` from `../renderer/spec-form/spec-form`; `specToZodSchema`, `getDefaultValues` from `../schema/zod-builder`; `zodResolver` from `@hookform/resolvers/zod`; `Button` from `@knkcs/anker/atoms`; `toaster` from `@knkcs/anker/primitives`.
- Produces:

```tsx
export interface TryItViewProps {
	schema: Schema;                 // the draft
	plugins: FieldTypePlugin[];
	labels: { testSubmit: string; testSubmitSuccess: string };
}
export function TryItView(props: TryItViewProps): JSX.Element;
```

```tsx
// src/editor/try-it-view.tsx — complete implementation
import { Box, Flex } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@knkcs/anker/atoms";
import { toaster } from "@knkcs/anker/primitives";
import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { SpecForm } from "../renderer/spec-form/spec-form";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import { getDefaultValues, specToZodSchema } from "../schema/zod-builder";

export interface TryItViewProps {
	schema: Schema;
	plugins: FieldTypePlugin[];
	labels: { testSubmit: string; testSubmitSuccess: string };
}

export function TryItView({ schema, plugins, labels }: TryItViewProps) {
	const zodSchema = useMemo(() => specToZodSchema(schema, plugins), [schema, plugins]);
	const methods = useForm({
		resolver: zodResolver(zodSchema),
		defaultValues: getDefaultValues(schema),
	});

	const onValid = () => {
		toaster.create({ title: labels.testSubmitSuccess, type: "success" });
	};

	return (
		<FormProvider {...methods}>
			<form onSubmit={methods.handleSubmit(onValid)} data-testid="try-it-form">
				<SpecForm schema={schema} />
				<Flex justify="flex-end" mt="6">
					<Button type="submit" variant="solid">{labels.testSubmit}</Button>
				</Flex>
			</form>
		</FormProvider>
	);
}
TryItView.displayName = "TryItView";
```

- [ ] **Step 1: Write failing tests** — full code; cases: renders SpecForm fields interactively (no aria-hidden wrapper, inputs typable via fireEvent.change asserting value); Test submit with a required empty field shows the tab error badge (reuse the zod path: field with `required: true` + plugin toZodType `z.string().min(1)`); Test submit with valid data calls `toaster.create` (spy via `vi.mock("@knkcs/anker/primitives", async (orig) => ({ ...(await orig()), toaster: { create: vi.fn() } })` — or assert the rendered toast if simpler; the mock is more deterministic). Fresh-mount data loss (spec: "scratch data discarded on exit") is covered in T12's mode-switch test, not here.

- [ ] **Step 2–4: RED → implement → GREEN.**

- [ ] **Step 5: Full gate + commit**

```bash
git add src/editor/try-it-view.tsx src/editor/__tests__/try-it.test.tsx
git commit -m "feat(editor): Try-it mode with scratch form and test submit"
```

---

### Task 12: `SpecEditor` shell — the new public component

**Files:**
- Rewrite: `src/editor/spec-editor.tsx`
- Delete: `src/editor/field-modal.tsx`, `src/editor/__tests__/field-modal.test.tsx`
- Rewrite: `src/editor/__tests__/spec-editor.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces — THE public API (spec-mandated):

```tsx
export interface EditorLabels {
	// canvas / SpecForm passthrough
	defaultTab?: string; searchPlaceholder?: string; noResults?: string;
	hiddenField?: string; groupPreview?: string; addField?: string; emptySpec?: string;
	// header
	save?: string; discard?: string; build?: string; tryIt?: string;
	fixValidationFirst?: string; saveFailed?: string;
	// try-it
	testSubmit?: string; testSubmitSuccess?: string;
	// sections
	addSection?: string; newSectionName?: string; sectionNameInput?: string;
	renameSection?: string; moveLeft?: string; moveRight?: string;
	deleteSection?: string; deleteSectionConfirm?: string; // "{section}" interpolated
	orientationH?: string; orientationV?: string; sectionMenu?: string; // "{section}" interpolated aria
	moveToSection?: string;
	// shell toolbar
	dragField?: string; editField?: string; duplicateField?: string;
	deleteField?: string; systemLocked?: string;
	// delete undo
	fieldDeleted?: string; undo?: string;
	// panel
	panelGeneral?: string; panelValidation?: string; panelTypeSettings?: string;
	panelNoSettings?: string; panelChildren?: string; panelBack?: string; panelClose?: string;
	panelLocalizable?: string; accessorInUse?: string; accessorEmpty?: string;
	committedAccessorWarning?: string;
	// validation messages by SpecFieldErrorCode ("{accessor}" interpolated)
	errorDuplicateAccessor?: string; errorEmptyName?: string; errorEmptyAccessor?: string;
}
```

`DEFAULT_EDITOR_LABELS: Required<EditorLabels>` lives beside the component with English defaults for every key (single source — no string literals anywhere else in `/editor`). A module-level helper maps `SpecFieldError.code` → the corresponding label with `{accessor}` interpolation; the panel and any error summaries render translated messages through it.

```ts
export interface SpecEditorProps {
	schema: Schema;
	onCommit: (schema: Schema) => void;
	onDirtyChange?: (dirty: boolean) => void;
	plugins: FieldTypePlugin[];
	context?: FieldContext;
	title?: ReactNode;               // header left slot (small spec addition, flagged in handoff)
	labels?: EditorLabels;
}
export const SpecEditor: …  // displayName "SpecEditor"
```

Structure (complete component, ~150 lines):
- `useSpecDraft(schema, plugins, onCommit, onDirtyChange)`.
- `const [mode, setMode] = useState<"build" | "tryit">("build")`; `const [selected, setSelected] = useState<string | null>(null)`; `const [autoFocusLabel, setAutoFocusLabel] = useState(false)`.
- Wrap everything in `ConfirmModalProvider` (from `@knkcs/anker/feedback`) and render anker `Toaster` (from `/primitives`) once.
- Header `Flex` (borderBottom, `bg="bg-subtle"`, p="2"): left `{title}` + `DirtyDot` (from `@knkcs/anker/atoms`) when `spec.dirty`; right: segmented Build/Try-it control (two Buttons, `variant={mode === x ? "solid" : "ghost"}`, Try-it `disabled={!spec.validation.valid}` wrapped in `Tooltip content={labels.fixValidationFirst}` when disabled), `Button variant="outline"` Discard (`disabled={!spec.dirty || spec.saving}`, onClick `spec.discard()` + `setSelected(null)`), `Button variant="solid"` Save (`disabled={!spec.dirty || !spec.validation.valid || spec.saving}`, `loading={spec.saving}`, onClick `spec.save()`). An effect watches `spec.saveError`: on a new error, `toaster.create({ title: labels.saveFailed, type: "error" })` — the draft stays dirty (hook guarantees), so the author can retry.
- Body: `mode === "tryit"` → `<TryItView key={tryItNonce} schema={spec.draft} …/>` (a `key` that changes on every entry to Try-it guarantees a fresh mount → scratch data cannot survive exits; increment a nonce in the toggle handler). Else `Flex`: `<EditorCanvas flex="1" …/>` + `<FieldConfigPanel …/>` when `selected` resolves to a field in the draft (`spec.draft.find(...)`; selection of a since-deleted accessor renders no panel).
- `onEdit(accessor)` = `setSelected(accessor); setAutoFocusLabel(true)`; plain `onSelect` RESETS `autoFocusLabel` to false (review finding: otherwise every later click-select steals focus into the panel). Panel `onFieldChange` = `spec.apply(updateField(spec.draft, selected, next))`; when the applied field's accessor differs from `selected`, update `selected` to the new accessor in the same handler (the panel's local gate — T9 — guarantees the new accessor is unique, so this re-sync is unambiguous).
- **Delete undo toast:** the canvas's delete handler is provided by SpecEditor: it captures `{ field, flatIndex }` before `apply(removeField(...))`, then `toaster.create({ title: labels.fieldDeleted, type: "info", action: { label: labels.undo, onClick: () => spec.apply(insertFieldAt(spec.draft, field, flatIndex)) } })`. Single level, best-effort (if the draft changed shape since, `insertFieldAt` clamps the index — acceptable). Verify `toaster.create`'s action API against `node_modules/@knkcs/anker/dist/primitives` (zag toast supports `action: { label, onClick }`); if unavailable, render the Undo as a plain button inside the toast description.
- `committedAccessors` for the panel: `useMemo(() => new Set(schema.map((f) => f.config.api_accessor)), [schema])` — the last committed spec the consumer gave us.
- Escape key (document listener, build mode only): if `event.defaultPrevented`, ignore (popover/menu/rename inputs handle their own Escape); else `setSelected(null)`.
- Render anker `Toaster` once inside SpecEditor; document in MDX that hosts already mounting a global `Toaster` will see editor toasts through their own instance (anker's toaster is a module singleton) — no prop needed.

- [ ] **Step 1: Rewrite the spec-editor tests** — `src/editor/__tests__/spec-editor.test.tsx`, full file, covering: renders canvas fields from schema; Save disabled when clean; edit via panel (select shell → panel opens → change label → canvas shell text updates) makes dirty; Save calls `onCommit` once with the edited schema and disables again; Discard reverts the canvas; Try-it toggle renders typable inputs, and toggling back to Build then to Try-it again loses typed data (fresh mount — assert input value empty); Try-it disabled with a tooltip when the draft is invalid (fixture with duplicate accessors); Escape clears selection; `onDirtyChange` fires; async `onCommit` rejection keeps Save enabled/dirty and shows the error toast (mock a rejecting onCommit); delete shows the undo toast and Undo restores the field at its position. Use `EditorWrap` fixtures; every tab click wrapped in `act`.

- [ ] **Step 2: RED** — the new tests fail against the old SpecEditor.

- [ ] **Step 3: Implement the rewrite; delete `field-modal.tsx` and its test file.** Old `spec-editor.test.tsx` content is fully replaced by Step 1's file. Keep `type-picker.tsx` and its test untouched (still used inside the popover).

- [ ] **Step 4: Run the full editor suite** — `npx vitest run src/editor/` → PASS. Then the whole suite: integration tests in `src/__tests__/integration.test.tsx` may exercise the old editor API — if any test passes `onChange` to SpecEditor, update it to `onCommit` + drive Save.

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add -A src/editor/ src/__tests__/
git commit -m "feat(editor)!: WYSIWYG SpecEditor with draft session

BREAKING CHANGE: SpecEditor onChange replaced by onCommit; edits stay in
an internal draft until Save. FieldModal removed."
```

---

### Task 13: exports, stories, MDX, version, release prep

**Files:**
- Modify: `src/editor/index.ts` — export `SpecEditor`, `SpecEditorProps`, `EditorLabels`, `useSpecDraft`, `SpecDraft` (drop the `FieldModal` export)
- Rewrite: `src/editor/spec-editor.stories.tsx`; Create: `src/editor/spec-editor.mdx`
- Modify: `CLAUDE.md` (editor layer line), `package.json` (`"version": "0.2.0"`)

- [ ] **Step 1: Exports** — update `src/editor/index.ts`; run `npm run verify-exports` → PASS.

- [ ] **Step 2: Stories** — follow the current story file's provider pattern (it wraps with ChakraProvider + FieldKitProvider + built-in plugins — mirror `src/renderer/spec-form/spec-form.stories.tsx` conventions). Stories: `Build` (sectioned schema, stateful args wiring `onCommit` to a `useState` + action log), `TryIt` (same schema, initial mode via play function or a note to toggle manually — if mode isn't controllable via props, document the manual toggle in MDX and keep the story simple), `Sectionless`, `Empty` (schema `[]` — shows the always-visible insertion point), `InvalidDraft` (duplicate accessors — badges + disabled Save/Try-it visible).
- [ ] **Step 3: MDX** — `spec-editor.mdx`: the draft model (`onCommit`, dirty, Discard), Build-mode affordances (selection, toolbar, ⊕, section menus, search), Try-it, `labels` table, and the migration note ("0.1 `onChange` consumers: remove per-edit persistence, handle `onCommit`; wire `onDirtyChange` into `UnsavedChangesGuard` if the host page needs leave protection").
- [ ] **Step 4: CLAUDE.md + version** — editor layer line becomes: "**`/editor`** — WYSIWYG specification editor. `SpecEditor` (draft session, Build/Try-it modes, side config panel), `TypePicker`. Uses dnd-kit for reordering." Set `package.json` version `0.2.0`.
- [ ] **Step 5: Full gate + storybook + commit**

```bash
npm run test && npm run typecheck && npm run lint && npm run build && npm run verify-exports && npm run build:storybook
git add src/editor/ CLAUDE.md package.json
git commit -m "feat(editor): export new SpecEditor; stories, docs, v0.2.0"
```

---

## Deferred (tracked, not in this plan)

- Condition editing UI (spec amendment 2026-07-04: renderer doesn't evaluate conditions yet — build the renderer side first).
- fieldkit#24/#25/#26 follow-ups (tab-shell dedup, combobox a11y, read-mode fallback) — independent of this plan.
- anker#146 (`optionalText`), anker#148 (`DirtyDot` label prop — the header dirty dot here inherits the German aria-label until it lands).

## Design-Review Amendments (2026-07-04)

A pre-execution senior review (verdict: execute with amendments) produced the spec's "Amendments" section; this plan incorporates all of them: identity-based FieldComponent memo (T5 Step 0), panel-local accessor gate + committed-accessor warning + baseline-aware slug latch (T9), content-equality draft-reset guard + dirty-keeps-draft + Promise-aware onCommit with saveError (T3, T12), moveSection first-section no-op (T2), system-field lock + system:false on duplicate (T4, T2), delete-undo toast (T12), keyboard-selectable shells (T4), full EditorLabels coverage + validateSpec error codes (T1, T12), localizable checkbox + trim-on-blur (T9), group framed preview + defaults-guarded scratch reset + hidden-inclusive search index (T5), numeric insert accessors + labeled empty states (T6), merge-wording confirm + Escape containment (T7), duplicate badges on all affected tabs (T10).

## Self-Review Notes

- Spec coverage: API+draft (T3/T12), canvas+inert fields+search (T5), insertion (T6), sections incl. first-section delete semantics (T2 `deleteSection` removes marker only → leading fields; T7 UI), dnd + cross-tab (T8), panel + live preview + group drill-in (T9), validation gating Save + outlines/badges (T1/T10/T12), Try-it incl. disabled-on-invalid + fresh-mount discard (T11/T12), stories/MDX/version (T13). Condition section deferred via spec amendment. Spacing rhythm inherited from FieldRenderer (already shipped).
- Known judgment calls flagged to implementers: Chakra v3 `MenuItem` click semantics (T7 note), dnd-kit keyboard event codes (T8 note), `title` prop is a small spec addition (T12).
- Type consistency: `SpecDraft`, `EditorLabels`, `PanelSectionProps`, `flatInsertIndex`, `tabdrop-${i}`, `shell-${accessor}` test ids used consistently across tasks.
