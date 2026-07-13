# Card Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fieldkit 0.8.0 — stacked, optionally-titled card groups within a tab, driven by a flat `card` layout marker (one level below `section`), rendered by SpecForm (edit + read), authored on the SpecEditor canvas (header-bar frames, "+ Card", block drag, delete-merge), with values byte-identical to a card-less schema.

**Architecture:** A `card` field is a structural marker exactly like `section` one level down: within a tab, fields after the marker belong to that card until the next `card`/`section` marker. A new pure helper `partitionTabByCards` (React-free, sibling of `partition.ts`) is the single grouping implementation shared by SpecForm edit mode, read mode, the editor canvas, and validateSpec's new `loose_field_in_carded_tab` rule. The editor canvas stays ONE flat sortable list per tab — card frames are only how the list renders; the card header's drag handle performs a block move via a new `moveCard` draft op.

**Tech Stack:** TypeScript, React 19, Chakra v3 via @knkcs/anker (semantic tokens), dnd-kit, Zod 3, Vitest + @testing-library/react (jsdom), Biome, Storybook.

**Spec:** `docs/superpowers/specs/2026-07-10-card-layout-design.md` (approved, decisions LOCKED). Branch: `feat/card-layout`.

## Global Constraints

- All work on branch `feat/card-layout`; never commit to main.
- Conventional Commits, subject < 72 chars, scopes here: `schema`, `editor`, `renderer`, `table`, or none.
- `npm run typecheck` && `npm run lint` must be green before every commit; `npm run test` (full suite) before finishing a task.
- Ships as **0.8.0** (bump in the final task). The release tag push / npm publish is NOT part of this plan — only after explicit user OK.
- No new public exports beyond what the spec names: `/schema` gains `cardPlugin`, `partitionTabByCards` (+ its `CardGroup`/`CardPartition` types), and the `loose_field_in_carded_tab` error code; the new EditorLabels keys are type-level additions. Every other new module (`card-surface`, `carded-fields`, `card-frame`, `card-menu`) stays package-internal.
- Token-first styling: anker semantic tokens only (`bg-surface`, `bg-subtle`, `border`, `accent`, `fg.muted`, `danger.600`) — no hardcoded colors. Icons from lucide-react only. `displayName` on every exported React component.
- All new user-facing strings route through `EditorLabels` (editor) with English defaults in `DEFAULT_EDITOR_LABELS`; SpecFormLabels gains NO new keys (cards add no renderer strings — an untitled card renders no header).
- TDD: every task writes its failing test first (superpowers:test-driven-development).
- **Spec refinements (locked during planning):** (1) `card` markers are EXEMPT from validateSpec's `empty_name` rule — an untitled card (Decision 3) must not disable Save. (2) `buildSearchIndex` filters out `card` markers so field search behavior stays exactly as the spec promises ("no changes"). (3) `resolveMarkerConvention` skips `card` markers like `section` (a marker is not an optional field). (4) `moveCard(schema, cardAccessor, targetCardAccessor, "before" | "after")` snaps block moves to card-block boundaries; releasing a card header over a tab trigger is a no-op (no cross-tab card drag in v1). (5) New cards are inserted untitled; naming happens via the config panel's auto-focused Name input (there is no `newCardName` label).

---

### Task 1: `card` plugin, registration, structural skips

**Files:**
- Create: `src/schema/field-types/card.ts`
- Modify: `src/schema/field-types/index.ts` (import at line 5 area, `structuralFieldTypes` at lines 49-54, named exports at lines 81-106)
- Modify: `src/schema/zod-builder.ts:7` (`STRUCTURAL_TYPES` — one set covers both the schema path at line 22 and the defaults path at line 63)
- Modify: `src/schema/marker-convention.ts` (the `field_type === "section"` skip in `countFields`)
- Modify: `src/schema/index.ts` (field-types export block)
- Modify: `src/table/get-cell-for-type.tsx:21-27` (filter)
- Modify: `src/renderer/fields/__tests__/all-fields-smoke.test.tsx:21-23` (filter)
- Modify: `src/schema/field-types/__tests__/default-values.test.ts:27-35` (`UNSEEDED` list)
- Test: Create `src/schema/field-types/__tests__/card.test.ts`; extend `src/table/__tests__/get-cell-for-type.test.tsx`

**Interfaces:**
- Consumes: `FieldTypePlugin` (`src/schema/plugin.ts`), `z.never()`.
- Produces: `cardPlugin: FieldTypePlugin` with `id: "card"`, `category: "structural"`, `fieldComponent: () => null`, no `cellComponent`, `toZodType → z.never()`, `defaultSettings: {}`, NO `defaultValue`, registered in `builtInFieldTypes` (inside `structuralFieldTypes`) and exported from `@knkcs/fieldkit/schema`. `STRUCTURAL_TYPES` = `{"section", "card"}`. Tasks 2-7 all rely on the `"card"` field_type string.

- [ ] **Step 1: Write the failing tests**

Create `src/schema/field-types/__tests__/card.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveMarkerConvention } from "../../marker-convention";
import type { Field } from "../../types";
import { getDefaultValues, specToZodSchema } from "../../zod-builder";
import { cardPlugin } from "../card";
import { builtInFieldTypes } from "../index";

function cardField(name = "Details", accessor = "details_card"): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		children: null,
		system: false,
	};
}

describe("cardPlugin", () => {
	it("has correct metadata", () => {
		expect(cardPlugin.id).toBe("card");
		expect(cardPlugin.category).toBe("structural");
		expect(cardPlugin.cellComponent).toBeUndefined();
		expect(cardPlugin.defaultValue).toBeUndefined();
		expect(cardPlugin.defaultSettings).toEqual({});
		expect(cardPlugin.maxPerSpec).toBeUndefined();
	});

	it("returns z.never() from toZodType", () => {
		const zodType = cardPlugin.toZodType(cardField());
		expect(zodType.safeParse("anything").success).toBe(false);
		expect(zodType.safeParse(undefined).success).toBe(false);
		expect(zodType.safeParse(null).success).toBe(false);
	});

	it("is registered in builtInFieldTypes", () => {
		expect(builtInFieldTypes.some((p) => p.id === "card")).toBe(true);
	});
});

describe("zod-builder skips card markers (STRUCTURAL_TYPES)", () => {
	it("specToZodSchema omits the card accessor from the shape", () => {
		const schema = specToZodSchema([cardField()], builtInFieldTypes);
		expect(Object.keys(schema.shape)).not.toContain("details_card");
		// A payload without the marker key parses — z.never() never runs.
		expect(schema.safeParse({}).success).toBe(true);
	});

	it("getDefaultValues never seeds a card accessor — even with an explicit default_value", () => {
		const withDefault = cardField();
		withDefault.config.default_value = "STRAY";
		// The structural skip runs BEFORE the config.default_value branch.
		expect(getDefaultValues([withDefault], builtInFieldTypes)).toEqual({});
	});
});

describe("marker convention ignores card markers", () => {
	it("card markers don't count toward the §10 marker majority", () => {
		const required = (accessor: string): Field => ({
			field_type: "text",
			config: {
				name: accessor,
				api_accessor: accessor,
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		});
		// 2 required + 2 markers: counting markers as optional fields would
		// tie the majority and flip the convention to "asterisk".
		expect(
			resolveMarkerConvention([
				required("a"),
				required("b"),
				cardField("Basics", "c1"),
				cardField("", "c2"),
			]),
		).toBe("optional-text");
	});
});
```

In `src/schema/field-types/__tests__/default-values.test.ts`, extend the `UNSEEDED` list (this test pins the seeded/unseeded split BIDIRECTIONALLY — its "covers every built-in plugin exactly once" case fails the moment `cardPlugin` registers without this edit). Replace:

```ts
const UNSEEDED = [
	"color",
	"time",
	"date",
	"radio",
	"rich_text",
	"toc_reference",
	"section",
];
```

with:

```ts
const UNSEEDED = [
	"color",
	"time",
	"date",
	"radio",
	"rich_text",
	"toc_reference",
	"section",
	"card",
];
```

In `src/table/__tests__/get-cell-for-type.test.tsx`, add after the `"should skip section fields"` case (reuse the file's `makeField` and `plugins` — the filter fires on `field_type` before any plugin lookup, so `plugins` needs no card entry):

```ts
	it("should skip card fields (layout markers, no data)", () => {
		const schema: Schema = [
			makeField({
				field_type: "text",
				config: {
					name: "Title",
					api_accessor: "title",
					required: true,
					instructions: "",
				},
			}),
			makeField({
				field_type: "card",
				config: {
					name: "Details",
					api_accessor: "details_card",
					required: false,
					instructions: "",
				},
			}),
		];

		const columns = getCellForFieldType(schema, plugins);
		expect(columns).toHaveLength(1);
		expect(columns[0].id).toBe("title");
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/schema/field-types/__tests__/card.test.ts src/schema/field-types/__tests__/default-values.test.ts src/table/__tests__/get-cell-for-type.test.tsx`
Expected: card.test.ts FAILS (cannot resolve `../card`); default-values FAILS ("covers every built-in plugin exactly once" — pinned list now names `card`, registry doesn't have it); get-cell case FAILS (2 columns, card not skipped).

- [ ] **Step 3: Implement**

Create `src/schema/field-types/card.ts`:

```ts
import { PanelTop } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

/**
 * Card layout marker (spec 2026-07-10): a purely visual grouping marker one
 * level below `section` — within a tab, fields after the marker belong to
 * the card until the next `card` or `section` marker. `config.name` is the
 * OPTIONAL title (empty = untitled). `settings` carries nothing in v1.
 * No `defaultValue`: markers never produce a form value.
 */
export const cardPlugin: FieldTypePlugin = {
	id: "card",
	name: "Card",
	description: "A visual card that groups the fields after it",
	icon: PanelTop,
	category: "structural",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(_field: Field) {
		return z.never();
	},

	defaultSettings: {},
	availableIn: ["blueprint", "task", "form"],
};
```

`src/schema/field-types/index.ts` — three edits:

1. Add import (between `booleanPlugin` and `checkboxesPlugin`, keeping alphabetical order):

```ts
import { booleanPlugin } from "./boolean";
import { cardPlugin } from "./card";
import { checkboxesPlugin } from "./checkboxes";
```

2. Register in `structuralFieldTypes` — replace:

```ts
export const structuralFieldTypes: FieldTypePlugin<any>[] = [
	sectionPlugin,
	groupPlugin,
	blocksPlugin,
	arrayPlugin,
];
```

with:

```ts
export const structuralFieldTypes: FieldTypePlugin<any>[] = [
	sectionPlugin,
	cardPlugin,
	groupPlugin,
	blocksPlugin,
	arrayPlugin,
];
```

3. In the named export block, after `sectionPlugin,` add `cardPlugin,`:

```ts
	sectionPlugin,
	cardPlugin,
	groupPlugin,
```

`src/schema/zod-builder.ts` — replace:

```ts
/** Structural field types that don't produce a value in the form data. */
const STRUCTURAL_TYPES = new Set(["section"]);
```

with:

```ts
/** Structural field types that don't produce a value in the form data.
 * One set covers BOTH paths: specToZodSchema (schema) and getDefaultValues
 * (defaults) skip these before any plugin/config lookup. */
const STRUCTURAL_TYPES = new Set(["section", "card"]);
```

`src/schema/marker-convention.ts` — in `countFields`, replace:

```ts
		if (field.field_type === "section") continue;
```

with:

```ts
		if (field.field_type === "section" || field.field_type === "card") continue;
```

and in the docstring above `resolveMarkerConvention`, change the sentence `Counts fields that render a label: \`section\` markers and hidden` to `Counts fields that render a label: \`section\`/\`card\` markers and hidden`.

`src/schema/index.ts` — in the built-in plugins export block, after `builtInFieldTypes,` add `cardPlugin,`:

```ts
	builtInFieldTypes,
	cardPlugin,
	checkboxesPlugin,
```

`src/table/get-cell-for-type.tsx` — replace:

```ts
			// Skip section fields (structural only, no data)
			if (field.field_type === "section") return false;
```

with:

```ts
			// Skip section/card fields (structural layout markers, no data)
			if (field.field_type === "section") return false;
			if (field.field_type === "card") return false;
```

and update the function docstring line `Skips section (structural) fields and hidden fields.` to `Skips section/card (structural) fields and hidden fields.`

`src/renderer/fields/__tests__/all-fields-smoke.test.tsx` — replace:

```ts
const fieldTypes = builtInFieldTypes
	.filter((p) => p.id !== "section") // Section renders null — tested separately
	.map((p) => p.id);
```

with:

```ts
const fieldTypes = builtInFieldTypes
	// Structural markers render null — tested separately
	.filter((p) => p.id !== "section" && p.id !== "card")
	.map((p) => p.id);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/schema/ src/table/__tests__/get-cell-for-type.test.tsx src/renderer/fields/__tests__/all-fields-smoke.test.tsx`
Expected: PASS (all new cases green, no regressions in the schema suite).

- [ ] **Step 5: Full gates**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS. (Watch `src/editor/__tests__/type-picker.test.tsx` and `max-per-spec.test.tsx` — they use their own local plugin fixtures, not `builtInFieldTypes`, so no change expected; if any test iterates `builtInFieldTypes` and pins a count, update the count.)

- [ ] **Step 6: Commit**

```bash
git add src/schema/ src/table/ src/renderer/fields/__tests__/all-fields-smoke.test.tsx
git commit -m "feat(schema): card layout marker plugin + structural skips"
```

---

### Task 2: `partitionTabByCards` pure helper

**Files:**
- Create: `src/schema/partition-cards.ts`
- Modify: `src/schema/index.ts` (export block, next to the existing Partition exports)
- Test: Create `src/schema/__tests__/partition-cards.test.ts`

**Interfaces:**
- Consumes: `Field` from `src/schema/types.ts`; the `"card"` field_type (Task 1).
- Produces (used VERBATIM by Tasks 3, 4a, 4b, 6a):

```ts
export interface CardGroup {
	/** The card marker; null ONLY for the implicit leading group (loose
	 * fields before the first marker — the renderer's degrade rule). */
	card: Field | null;
	fields: Field[];
}

export interface CardPartition {
	cards: CardGroup[];
	hasCards: boolean;
}

export function partitionTabByCards(fields: Field[]): CardPartition;
```

Input is ONE tab's fields (`SpecTab.fields`) — section markers never reach it because `partitionSchemaBySections` runs first.

- [ ] **Step 1: Write the failing tests**

Create `src/schema/__tests__/partition-cards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { partitionTabByCards } from "../partition-cards";
import type { Field } from "../types";

function makeField(accessor: string, type = "text"): Field {
	return {
		field_type: type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

function makeCard(accessor: string, name = accessor): Field {
	const card = makeField(accessor, "card");
	return { ...card, config: { ...card.config, name }, settings: {} };
}

describe("partitionTabByCards", () => {
	it("returns a single implicit group for a tab without cards", () => {
		const result = partitionTabByCards([makeField("a"), makeField("b")]);
		expect(result.hasCards).toBe(false);
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0].card).toBeNull();
		expect(result.cards[0].fields.map((f) => f.config.api_accessor)).toEqual([
			"a",
			"b",
		]);
	});

	it("groups fields under the preceding card marker", () => {
		const result = partitionTabByCards([
			makeCard("c1", "Basics"),
			makeField("a"),
			makeField("b"),
			makeCard("c2", "Extra"),
			makeField("x"),
		]);
		expect(result.hasCards).toBe(true);
		expect(result.cards).toHaveLength(2);
		expect(result.cards[0].card?.config.api_accessor).toBe("c1");
		expect(result.cards[0].fields.map((f) => f.config.api_accessor)).toEqual([
			"a",
			"b",
		]);
		expect(result.cards[1].card?.config.api_accessor).toBe("c2");
		expect(result.cards[1].fields.map((f) => f.config.api_accessor)).toEqual([
			"x",
		]);
	});

	it("puts leading loose fields into an implicit null-card group (degrade rule)", () => {
		const result = partitionTabByCards([
			makeField("loose"),
			makeCard("c1", "Basics"),
			makeField("a"),
		]);
		expect(result.hasCards).toBe(true);
		expect(result.cards).toHaveLength(2);
		expect(result.cards[0].card).toBeNull();
		expect(result.cards[0].fields.map((f) => f.config.api_accessor)).toEqual([
			"loose",
		]);
		expect(result.cards[1].card?.config.api_accessor).toBe("c1");
	});

	it("preserves untitled cards (empty name) and empty cards", () => {
		const result = partitionTabByCards([
			makeCard("c1", ""),
			makeCard("c2", "Named"),
			makeField("a"),
		]);
		expect(result.cards).toHaveLength(2);
		expect(result.cards[0].card?.config.name).toBe("");
		expect(result.cards[0].fields).toEqual([]);
		expect(result.cards[1].fields).toHaveLength(1);
	});

	it("returns no groups for an empty tab", () => {
		expect(partitionTabByCards([])).toEqual({ cards: [], hasCards: false });
	});

	it("does not mutate its input", () => {
		const input = [makeCard("c1", "X"), makeField("a")];
		const snapshot = [...input];
		partitionTabByCards(input);
		expect(input).toEqual(snapshot);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/__tests__/partition-cards.test.ts`
Expected: FAIL — cannot resolve `../partition-cards`.

- [ ] **Step 3: Implement**

Create `src/schema/partition-cards.ts`:

```ts
import type { Field } from "./types";

export interface CardGroup {
	/** The card marker; null ONLY for the implicit leading group (loose
	 * fields before the first marker — the renderer's degrade rule). */
	card: Field | null;
	fields: Field[];
}

export interface CardPartition {
	cards: CardGroup[];
	hasCards: boolean;
}

/**
 * Splits ONE tab's fields into card groups at each `card` marker — the
 * card-layout sibling of `partitionSchemaBySections`, one level down.
 * Input is a SpecTab's `fields` (section markers never reach it because
 * partitionSchemaBySections runs first). Pure and React-free — shared by
 * SpecForm (edit + read), the editor canvas, and validateSpec.
 */
export function partitionTabByCards(fields: Field[]): CardPartition {
	const cards: CardGroup[] = [];
	let current: CardGroup | null = null;
	let hasCards = false;

	for (const field of fields) {
		if (field.field_type === "card") {
			hasCards = true;
			current = { card: field, fields: [] };
			cards.push(current);
		} else {
			if (!current) {
				current = { card: null, fields: [] };
				cards.push(current);
			}
			current.fields.push(field);
		}
	}

	return { cards, hasCards };
}
```

Add to `src/schema/index.ts`, directly after the existing Partition export block (`export { partitionSchemaBySections, ... } from "./partition";`):

```ts
// Card partition (within one tab)
export {
	type CardGroup,
	type CardPartition,
	partitionTabByCards,
} from "./partition-cards";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/schema/__tests__/partition-cards.test.ts && npm run typecheck`
Expected: PASS (6 tests).

- [ ] **Step 5: Full test + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/schema/partition-cards.ts src/schema/__tests__/partition-cards.test.ts src/schema/index.ts
git commit -m "feat(schema): partitionTabByCards card-layout helper"
```

---

### Task 3: validateSpec `loose_field_in_carded_tab` rule + untitled-card exemption

**Files:**
- Modify: `src/schema/validate-spec.ts` (error-code union at lines 4-7; `validateSpec` body at lines 56-59; `checkAccessors` empty-name check at lines 68-74; new `checkCardLayout` function)
- Test: `src/schema/__tests__/validate-spec.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `partitionSchemaBySections` (`src/schema/partition.ts`), `partitionTabByCards` (Task 2).
- Produces: `SpecFieldErrorCode` union gains `"loose_field_in_carded_tab"`. Within a tab containing at least one card marker, EACH field before the first marker yields a `SpecFieldError` (existing shape: `{ accessor, code, message }`) — so shell outlines and tab badges work with zero editor changes. Card markers become exempt from `empty_name` (their title is optional per Decision 3); their accessor rules are unchanged. Task 6b maps the new code to `labels.errorLooseFieldInCardedTab`.

- [ ] **Step 1: Write the failing tests**

Append to `src/schema/__tests__/validate-spec.test.ts` (reuses the file's `mockPlugin`):

```ts
describe("validateSpec — card layout", () => {
	const plugins = new Map([
		["text", mockPlugin("text")],
		["card", mockPlugin("card")],
		["section", mockPlugin("section")],
	]);

	function field(accessor: string): Field {
		return {
			field_type: "text",
			config: {
				name: accessor,
				api_accessor: accessor,
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
	}

	function card(accessor: string, name = ""): Field {
		return {
			field_type: "card",
			config: { name, api_accessor: accessor, required: false, instructions: "" },
			settings: {},
			children: null,
			system: false,
		};
	}

	function sectionMarker(accessor: string): Field {
		return {
			field_type: "section",
			config: {
				name: accessor,
				api_accessor: accessor,
				required: false,
				instructions: "",
			},
			settings: {},
			children: null,
			system: false,
		};
	}

	it("flags EACH loose field before a carded tab's first marker", () => {
		const result = validateSpec(
			[field("a"), field("b"), card("c1"), field("x")],
			plugins,
		);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors).toContainEqual({
			accessor: "a",
			code: "loose_field_in_carded_tab",
			message: 'Field "a" must be inside a card',
		});
		expect(result.fieldErrors).toContainEqual({
			accessor: "b",
			code: "loose_field_in_carded_tab",
			message: 'Field "b" must be inside a card',
		});
		// The field AFTER the marker is inside the card — not flagged.
		expect(
			result.fieldErrors.filter((e) => e.accessor === "x"),
		).toEqual([]);
	});

	it("is scoped per tab: a card in one tab doesn't constrain another tab", () => {
		const result = validateSpec(
			[
				field("loose_in_general"), // implicit tab, no cards here
				sectionMarker("s1"),
				card("c1", "Meta"),
				field("x"),
			],
			plugins,
		);
		expect(result.valid).toBe(true);
		expect(result.fieldErrors).toEqual([]);
	});

	it("accepts an all-in-cards tab and a card-less tab alike", () => {
		expect(
			validateSpec([card("c1"), field("a"), card("c2"), field("b")], plugins)
				.valid,
		).toBe(true);
		expect(validateSpec([field("a"), field("b")], plugins).valid).toBe(true);
	});

	it("allows an UNTITLED card (empty name is NOT empty_name)", () => {
		const result = validateSpec([card("c1", ""), field("a")], plugins);
		expect(result.valid).toBe(true);
		expect(
			result.fieldErrors.filter((e) => e.code === "empty_name"),
		).toEqual([]);
	});

	it("still enforces accessor rules on card markers", () => {
		const empty = card("");
		const result = validateSpec([empty, field("a")], plugins);
		expect(result.fieldErrors).toContainEqual({
			accessor: "",
			code: "empty_accessor",
			message: "Accessor must not be empty",
		});

		const dup = validateSpec([card("dup"), field("dup")], plugins);
		expect(
			dup.fieldErrors.some((e) => e.code === "duplicate_accessor"),
		).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/__tests__/validate-spec.test.ts`
Expected: the new block FAILS — no `loose_field_in_carded_tab` errors produced, and the untitled-card case reports `empty_name`. (TypeScript may also reject the code string before runtime — same signal.)

- [ ] **Step 3: Implement**

In `src/schema/validate-spec.ts`:

1. Add imports after the existing ones:

```ts
import { partitionSchemaBySections } from "./partition";
import { partitionTabByCards } from "./partition-cards";
```

2. Extend the code union — replace:

```ts
export type SpecFieldErrorCode =
	| "duplicate_accessor"
	| "empty_name"
	| "empty_accessor";
```

with:

```ts
export type SpecFieldErrorCode =
	| "duplicate_accessor"
	| "empty_name"
	| "empty_accessor"
	| "loose_field_in_carded_tab";
```

3. In `validateSpec`, replace:

```ts
	checkAccessors(fields, fieldErrors);
	for (const fe of fieldErrors) {
		errors.push(fe.message);
	}
```

with:

```ts
	checkAccessors(fields, fieldErrors);
	checkCardLayout(fields, fieldErrors);
	for (const fe of fieldErrors) {
		errors.push(fe.message);
	}
```

4. In `checkAccessors`, replace:

```ts
		if (!field.config.name.trim()) {
```

with:

```ts
		// Card markers are exempt from the empty-name rule: a card's title is
		// OPTIONAL (empty = untitled, card-layout Decision 3). Accessor rules
		// below apply to them unchanged.
		if (field.field_type !== "card" && !field.config.name.trim()) {
```

5. Add at the end of the file:

```ts
/**
 * Card-layout Decision 4: once a tab contains a card marker, every field in
 * that tab lives in a card — a field BEFORE the tab's first marker is an
 * error, flagged per field so shells outline and tab badges count it. The
 * editor's insertCard auto-wrap never produces this state; the rule catches
 * hand-written schemas. The renderer still degrades gracefully (implicit
 * untitled card) — a schema is data; this rule only reports the violation.
 * Top-level only: cards inside groups are a non-goal.
 */
function checkCardLayout(fields: Field[], fieldErrors: SpecFieldError[]): void {
	for (const tab of partitionSchemaBySections(fields).tabs) {
		const { cards, hasCards } = partitionTabByCards(tab.fields);
		if (!hasCards || cards.length === 0 || cards[0].card !== null) continue;
		for (const loose of cards[0].fields) {
			fieldErrors.push({
				accessor: loose.config.api_accessor,
				code: "loose_field_in_carded_tab",
				message: `Field "${loose.config.api_accessor}" must be inside a card`,
			});
		}
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/schema/ && npm run typecheck`
Expected: PASS. (Note: `src/editor/spec-editor.tsx`'s `translateFieldError` still maps the new code to its else-branch — Task 6b fixes the label mapping; nothing breaks type-wise because that function compares codes with `===`.)

- [ ] **Step 5: Full test + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/schema/validate-spec.ts src/schema/__tests__/validate-spec.test.ts
git commit -m "feat(schema): loose_field_in_carded_tab validation rule"
```

---

### Task 4a: SpecForm edit-mode card surfaces + skeleton-in-frames

**Files:**
- Create: `src/renderer/spec-form/card-surface.tsx`
- Create: `src/renderer/spec-form/carded-fields.tsx`
- Modify: `src/renderer/spec-form/spec-form.tsx` (imports at lines 11-19; loading branch at lines 439-446; SpecFormTabs content at lines 256-262; sectionless edit path at lines 476-482)
- Modify: `src/renderer/spec-form/spec-form-skeleton.tsx` (full rewrite, gains `cardSizes`)
- Modify: `src/renderer/spec-form/__tests__/helpers.tsx` (add `makeCard` + a card test plugin)
- Test: Create `src/renderer/spec-form/__tests__/spec-form-cards.test.tsx`

**Interfaces:**
- Consumes: `partitionTabByCards(fields: Field[]): CardPartition` with `CardPartition = { cards: CardGroup[]; hasCards: boolean }`, `CardGroup = { card: Field | null; fields: Field[] }` (Task 2); `FieldRenderer` (unchanged).
- Produces (package-internal, no new public exports):
  - `CardSurface({ title, children }: { title?: string; children: ReactNode })` — the styled card box; Task 4b (read mode + skeleton reuse) and Task 6a (editor's implicit-group degrade frame) import it from this exact path.
  - `CardedFields({ fields, readOnly }: { fields: Field[]; readOnly?: boolean })` — one tab's edit-mode body: `FieldRenderer` per card group when the tab has markers, plain `FieldRenderer` otherwise.
  - `SpecFormSkeleton({ fieldCount, showTabStrip, cardSizes })` — `cardSizes?: number[]` draws rows inside `CardSurface` frames.

- [ ] **Step 1: Write the failing tests**

First extend `src/renderer/spec-form/__tests__/helpers.tsx`. Add after `makeSection`:

```ts
export function makeCard(accessor: string, name = ""): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		system: false,
	};
}
```

and add a card entry to `testPlugins` (after the `section` entry):

```ts
	{
		id: "card",
		name: "Card",
		description: "",
		icon: () => null,
		category: "structural",
		fieldComponent: () => null,
		toZodType: () => z.never(),
	},
```

Create `src/renderer/spec-form/__tests__/spec-form-cards.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import { makeCard, makeField, makeSection, Wrapper } from "./helpers";

const cardedSchema = [
	makeCard("c1", "Basics"),
	makeField("title", "Title"),
	makeField("summary", "Summary"),
	makeCard("c2"), // untitled
	makeField("notes", "Notes"),
];

describe("SpecForm — carded edit mode", () => {
	it("renders one full-width card surface per marker, in schema order", () => {
		render(
			<Wrapper>
				<SpecForm schema={cardedSchema} />
			</Wrapper>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(surfaces).toHaveLength(2);
		expect(within(surfaces[0]).getByTestId("field-title")).toBeInTheDocument();
		expect(
			within(surfaces[0]).getByTestId("field-summary"),
		).toBeInTheDocument();
		expect(within(surfaces[1]).getByTestId("field-notes")).toBeInTheDocument();
	});

	it("shows a non-empty title as a small heading; untitled cards get none", () => {
		render(
			<Wrapper>
				<SpecForm schema={cardedSchema} />
			</Wrapper>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(
			within(surfaces[0]).getByRole("heading", { name: "Basics" }),
		).toBeInTheDocument();
		expect(within(surfaces[1]).queryByRole("heading")).not.toBeInTheDocument();
	});

	it("card markers render no form control of their own", () => {
		render(
			<Wrapper>
				<SpecForm schema={cardedSchema} />
			</Wrapper>,
		);
		expect(screen.queryByTestId("field-c1")).not.toBeInTheDocument();
		expect(screen.queryByTestId("field-c2")).not.toBeInTheDocument();
	});

	it("tabs without cards render exactly as today — no wrapper element", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a"), makeField("b")]} />
			</Wrapper>,
		);
		expect(screen.queryAllByTestId("card-surface")).toEqual([]);
		expect(screen.getByTestId("field-a")).toBeInTheDocument();
	});

	it("degrades gracefully: leading loose fields render INSIDE an implicit untitled card", () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[
						makeField("loose", "Loose"),
						makeCard("c1", "Extra"),
						makeField("b", "B"),
					]}
				/>
			</Wrapper>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(surfaces).toHaveLength(2);
		// The loose field actually RENDERS, inside the first (implicit) frame,
		// which has no heading of its own.
		expect(within(surfaces[0]).getByTestId("field-loose")).toBeInTheDocument();
		expect(within(surfaces[0]).queryByRole("heading")).not.toBeInTheDocument();
		expect(
			within(surfaces[1]).getByRole("heading", { name: "Extra" }),
		).toBeInTheDocument();
	});

	it("renders cards inside section tabs (all panels stay mounted)", () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[
						makeField("a"),
						makeSection("s1", "SEO"),
						makeCard("c1", "Meta"),
						makeField("m", "Meta title"),
					]}
				/>
			</Wrapper>,
		);
		const surface = screen.getByTestId("card-surface");
		expect(within(surface).getByTestId("field-m")).toBeInTheDocument();
		// The card-less implicit tab stays wrapper-free.
		expect(
			screen.getByTestId("field-a").closest("[data-testid='card-surface']"),
		).toBeNull();
	});

	it("skeleton draws its rows inside card frames when the first tab has cards", () => {
		render(
			<Wrapper>
				<SpecForm schema={cardedSchema} loading />
			</Wrapper>,
		);
		expect(screen.getByTestId("spec-form-skeleton")).toBeInTheDocument();
		expect(screen.getAllByTestId("card-surface")).toHaveLength(2);
	});

	it("skeleton stays flat for card-less schemas", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a")]} loading />
			</Wrapper>,
		);
		expect(screen.getByTestId("spec-form-skeleton")).toBeInTheDocument();
		expect(screen.queryAllByTestId("card-surface")).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/spec-form/__tests__/spec-form-cards.test.tsx`
Expected: FAIL — no `card-surface` testids exist (markers currently render null inside the flat FieldRenderer).

- [ ] **Step 3: Implement**

Create `src/renderer/spec-form/card-surface.tsx`:

```tsx
// src/renderer/spec-form/card-surface.tsx
import { Box, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

/**
 * The visual card frame shared by SpecForm's edit mode, read mode, and the
 * loading skeleton (and reused by the editor canvas for its implicit-group
 * degrade). Semantic tokens only: elevated surface, border, subtle shadow.
 * `title` renders as a small heading when non-empty; an untitled card is a
 * plain frame with no header (card-layout Decision 3).
 */
export function CardSurface({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) {
	return (
		<Box
			bg="bg-surface"
			borderWidth="1px"
			borderColor="border"
			borderRadius="lg"
			boxShadow="sm"
			p="5"
			data-testid="card-surface"
		>
			{title ? (
				<Text as="h3" fontSize="sm" fontWeight="semibold" mb="4">
					{title}
				</Text>
			) : null}
			{children}
		</Box>
	);
}
CardSurface.displayName = "CardSurface";
```

Create `src/renderer/spec-form/carded-fields.tsx`:

```tsx
// src/renderer/spec-form/carded-fields.tsx
import { Stack } from "@chakra-ui/react";
import { useMemo } from "react";
import { partitionTabByCards } from "../../schema/partition-cards";
import type { Field } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { CardSurface } from "./card-surface";

/**
 * Edit-mode body for ONE tab: stacked card frames when the tab contains
 * `card` markers, today's flat FieldRenderer otherwise (no wrapper element).
 * Leading loose fields in a carded tab render as an implicit untitled card —
 * the NORMATIVE graceful degrade: a schema is data, rendering must never
 * break on a `loose_field_in_carded_tab` validation violation.
 */
export function CardedFields({
	fields,
	readOnly,
}: {
	fields: Field[];
	readOnly?: boolean;
}) {
	const partition = useMemo(() => partitionTabByCards(fields), [fields]);

	if (!partition.hasCards) {
		return <FieldRenderer schema={fields} readOnly={readOnly} />;
	}

	return (
		<Stack gap="5">
			{partition.cards.map((group, i) => (
				<CardSurface
					key={group.card?.config.api_accessor ?? `implicit-${i}`}
					title={
						group.card?.config.name.trim() ? group.card.config.name : undefined
					}
				>
					{/* FieldRenderer keeps the 20px field rhythm inside the card. */}
					<FieldRenderer schema={group.fields} readOnly={readOnly} />
				</CardSurface>
			))}
		</Stack>
	);
}
CardedFields.displayName = "CardedFields";
```

Rewrite `src/renderer/spec-form/spec-form-skeleton.tsx` (full new content):

```tsx
import { Skeleton, Stack } from "@chakra-ui/react";
import { CardSurface } from "./card-surface";

const MAX_SKELETON_ROWS = 8;

function SkeletonRows({
	count,
	keyPrefix,
}: {
	count: number;
	keyPrefix: string;
}) {
	return (
		<>
			{Array.from({ length: count }, (_, i) => (
				<Stack key={`${keyPrefix}-${i as number}`} gap="1.5">
					<Skeleton height="4" width="30%" />
					<Skeleton height="9" />
				</Stack>
			))}
		</>
	);
}
SkeletonRows.displayName = "SkeletonRows";

export function SpecFormSkeleton({
	fieldCount,
	showTabStrip,
	cardSizes,
}: {
	fieldCount: number;
	showTabStrip: boolean;
	/** Per-card field counts of the first tab when it has card markers —
	 * the skeleton then draws its rows INSIDE card frames. Omitted or
	 * empty → the flat row list. */
	cardSizes?: number[];
}) {
	if (cardSizes && cardSizes.length > 0) {
		// Cap the TOTAL row count like the flat variant, but keep at least one
		// row per frame so an empty card still reads as a card.
		let remaining = MAX_SKELETON_ROWS;
		return (
			<Stack gap="5" data-testid="spec-form-skeleton">
				{showTabStrip && <Skeleton height="8" width="60%" />}
				{cardSizes.map((size, i) => {
					const rows = Math.max(1, Math.min(size, remaining));
					remaining = Math.max(1, remaining - rows);
					return (
						<CardSurface key={`skeleton-card-${i as number}`}>
							<Stack gap="5">
								<SkeletonRows
									count={rows}
									keyPrefix={`skeleton-card-${i}-row`}
								/>
							</Stack>
						</CardSurface>
					);
				})}
			</Stack>
		);
	}

	const rows = Math.max(1, Math.min(fieldCount, MAX_SKELETON_ROWS));
	return (
		<Stack gap="5" data-testid="spec-form-skeleton">
			{showTabStrip && <Skeleton height="8" width="60%" />}
			<SkeletonRows count={rows} keyPrefix="skeleton-row" />
		</Stack>
	);
}
SpecFormSkeleton.displayName = "SpecFormSkeleton";
```

In `src/renderer/spec-form/spec-form.tsx`, four hunks:

1. Imports — replace:

```ts
import { FieldRenderer } from "../field-renderer";
import { formatCount, mergeLabels } from "../merge-labels";
```

with:

```ts
import { formatCount, mergeLabels } from "../merge-labels";
import { CardedFields } from "./carded-fields";
```

and add after `import { partitionSchemaBySections } from "../../schema/partition";`:

```ts
import { partitionTabByCards } from "../../schema/partition-cards";
```

2. Loading branch — replace:

```tsx
	if (loading) {
		return (
			<SpecFormSkeleton
				fieldCount={schema.length}
				showTabStrip={partition.hasSections}
			/>
		);
	}
```

with:

```tsx
	if (loading) {
		// Skeleton draws inside card frames when the FIRST tab is carded —
		// the first tab is what's visible while loading.
		const firstTabCards = partitionTabByCards(partition.tabs[0]?.fields ?? []);
		return (
			<SpecFormSkeleton
				fieldCount={schema.length}
				showTabStrip={partition.hasSections}
				cardSizes={
					firstTabCards.hasCards
						? firstTabCards.cards.map((c) => c.fields.length)
						: undefined
				}
			/>
		);
	}
```

3. SpecFormTabs content — replace:

```tsx
			{partition.tabs.map((tab, i) => (
				<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
					<Box pt="4">
						<FieldRenderer schema={tab.fields} readOnly={readOnly} />
					</Box>
				</Tabs.Content>
			))}
```

with:

```tsx
			{partition.tabs.map((tab, i) => (
				<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
					<Box pt="4">
						<CardedFields fields={tab.fields} readOnly={readOnly} />
					</Box>
				</Tabs.Content>
			))}
```

4. Sectionless edit path — replace:

```tsx
	if (!partition.hasSections) {
		return (
			<FormMarkersProvider value={markers}>
				<FieldRenderer schema={partition.tabs[0].fields} readOnly={readOnly} />
			</FormMarkersProvider>
		);
	}
```

with:

```tsx
	if (!partition.hasSections) {
		return (
			<FormMarkersProvider value={markers}>
				<CardedFields
					fields={partition.tabs[0].fields}
					readOnly={readOnly}
				/>
			</FormMarkersProvider>
		);
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/ && npm run typecheck`
Expected: PASS — all 8 new cases green, no regressions across the renderer suite (card-less schemas hit the `!hasCards` branch and render byte-identical DOM).

- [ ] **Step 5: Full test + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/renderer/spec-form/
git commit -m "feat(renderer): card surfaces in SpecForm edit mode + skeleton"
```

---

### Task 4b: SpecForm read-mode parity, search-index filter, stories, spec-form.mdx

**Files:**
- Modify: `src/renderer/spec-form/carded-fields.tsx` (add `CardedReadTab`)
- Modify: `src/renderer/spec-form/spec-form.tsx` (read paths: SpecFormReadTabs content at lines 392-405; sectionless read at lines 453-466; drop the now-unused `ReadTab` import)
- Modify: `src/renderer/spec-form/search-index.ts` (filter card markers in `buildSearchIndex`)
- Modify: `src/renderer/spec-form/spec-form.stories.tsx` (Carded + CardedReadMode stories)
- Modify: `src/renderer/spec-form/spec-form.mdx` (Card Layout contract section + story canvases)
- Test: Create `src/renderer/spec-form/__tests__/spec-form-cards-read.test.tsx`

**Interfaces:**
- Consumes: `CardSurface`, `partitionTabByCards` (Tasks 2/4a); `ReadTab` (`src/renderer/spec-form/read-tab.tsx`, unchanged — reused per card group via a synthetic `SpecTab`).
- Produces (package-internal): `CardedReadTab({ tab, values, labels }: { tab: SpecTab; values: Record<string, unknown>; labels: { booleanYes: string; booleanNo: string } })`. `buildSearchIndex` excludes `field_type === "card"` rows (both modes AND the editor canvas, which shares it).

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/spec-form/__tests__/spec-form-cards-read.test.tsx`:

```tsx
import { Provider } from "@knkcs/anker/primitives";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { partitionSchemaBySections } from "../../../schema/partition";
import { FieldKitProvider } from "../../provider";
import { buildSearchIndex } from "../search-index";
import { SpecForm } from "../spec-form";
import { makeCard, makeField, makeSection, testPlugins } from "./helpers";

function renderRead(ui: React.ReactElement) {
	// No FormProvider on purpose: read mode must not require a form.
	return render(
		<Provider>
			<FieldKitProvider plugins={testPlugins}>{ui}</FieldKitProvider>
		</Provider>,
	);
}

const cardedSchema = [
	makeCard("c1", "Basics"),
	makeField("title", "Title"),
	makeCard("c2"), // untitled
	makeField("notes", "Notes"),
];

describe("SpecForm — carded read mode", () => {
	it("renders the same card boxes with description-list rows inside", () => {
		renderRead(
			<SpecForm
				schema={cardedSchema}
				mode="read"
				values={{ title: "Hello", notes: "World" }}
			/>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(surfaces).toHaveLength(2);
		expect(
			within(surfaces[0]).getByRole("heading", { name: "Basics" }),
		).toBeInTheDocument();
		expect(within(surfaces[0]).getByText("Title")).toBeInTheDocument();
		expect(within(surfaces[0]).getByText("Hello")).toBeInTheDocument();
		expect(within(surfaces[1]).getByText("World")).toBeInTheDocument();
		expect(within(surfaces[1]).queryByRole("heading")).not.toBeInTheDocument();
	});

	it("card markers add no label/value row of their own", () => {
		renderRead(
			<SpecForm schema={cardedSchema} mode="read" values={{}} />,
		);
		// "Basics" appears exactly once: as the card heading, never as a row
		// label with an em-dash value.
		expect(screen.getAllByText("Basics")).toHaveLength(1);
		// Only the two real fields render empty-value em dashes.
		expect(screen.getAllByText("—")).toHaveLength(2);
	});

	it("degrades gracefully in read mode: leading loose fields render in an implicit card", () => {
		renderRead(
			<SpecForm
				schema={[
					makeField("loose", "Loose"),
					makeCard("c1", "Extra"),
					makeField("b", "B"),
				]}
				mode="read"
				values={{ loose: "kept" }}
			/>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(surfaces).toHaveLength(2);
		expect(within(surfaces[0]).getByText("kept")).toBeInTheDocument();
		expect(within(surfaces[0]).queryByRole("heading")).not.toBeInTheDocument();
	});

	it("card-less read schemas render exactly as today", () => {
		renderRead(
			<SpecForm
				schema={[makeField("a", "Alpha")]}
				mode="read"
				values={{ a: "1" }}
			/>,
		);
		expect(screen.queryAllByTestId("card-surface")).toEqual([]);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
	});

	it("keeps tabs + cards together in read mode without a FormProvider", () => {
		renderRead(
			<SpecForm
				schema={[
					makeField("a", "Alpha"),
					makeSection("s1", "SEO"),
					...cardedSchema,
				]}
				mode="read"
				values={{}}
			/>,
		);
		expect(screen.getAllByRole("tab")).toHaveLength(2);
		expect(screen.getAllByTestId("card-surface")).toHaveLength(2);
	});
});

describe("buildSearchIndex — card markers", () => {
	it("never surfaces card markers as search results", () => {
		const tabs = partitionSchemaBySections([
			makeCard("c1", "Basics"),
			makeField("a", "Alpha"),
			makeSection("s1", "SEO"),
			makeCard("c2", "Meta"),
			makeField("b", "Beta"),
		]).tabs;
		const index = buildSearchIndex(tabs, "General");
		expect(index.map((r) => r.accessor)).toEqual(["a", "b"]);
		// The editor's includeHidden variant excludes them too.
		const editorIndex = buildSearchIndex(tabs, "General", {
			includeHidden: true,
		});
		expect(editorIndex.map((r) => r.accessor)).toEqual(["a", "b"]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/spec-form/__tests__/spec-form-cards-read.test.tsx`
Expected: FAIL — read mode renders a flat DescriptionList (no `card-surface`), markers show up as em-dash rows, and the search index contains `c1`/`c2`.

- [ ] **Step 3: Implement**

Append to `src/renderer/spec-form/carded-fields.tsx` (and extend its imports to):

```tsx
import { Stack } from "@chakra-ui/react";
import { useMemo } from "react";
import type { SpecTab } from "../../schema/partition";
import { partitionTabByCards } from "../../schema/partition-cards";
import type { Field } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { CardSurface } from "./card-surface";
import { ReadTab } from "./read-tab";
```

New component after `CardedFields`:

```tsx
/**
 * Read-mode body for ONE tab: the same card boxes as edit mode with
 * DescriptionList rows inside (via ReadTab per card group — a synthetic
 * SpecTab scoped to the group's fields), today's flat ReadTab otherwise.
 * Same implicit-untitled-card degrade for leading loose fields. Form-free:
 * ReadTab never touches react-hook-form.
 */
export function CardedReadTab({
	tab,
	values,
	labels,
}: {
	tab: SpecTab;
	values: Record<string, unknown>;
	labels: { booleanYes: string; booleanNo: string };
}) {
	const partition = useMemo(
		() => partitionTabByCards(tab.fields),
		[tab.fields],
	);

	if (!partition.hasCards) {
		return <ReadTab tab={tab} values={values} labels={labels} />;
	}

	return (
		<Stack gap="5">
			{partition.cards.map((group, i) => (
				<CardSurface
					key={group.card?.config.api_accessor ?? `implicit-${i}`}
					title={
						group.card?.config.name.trim() ? group.card.config.name : undefined
					}
				>
					<ReadTab
						tab={{ section: tab.section, fields: group.fields }}
						values={values}
						labels={labels}
					/>
				</CardSurface>
			))}
		</Stack>
	);
}
CardedReadTab.displayName = "CardedReadTab";
```

In `src/renderer/spec-form/spec-form.tsx`:

1. Replace the import `import { ReadTab } from "./read-tab";` with nothing (delete the line) and change `import { CardedFields } from "./carded-fields";` to:

```ts
import { CardedFields, CardedReadTab } from "./carded-fields";
```

2. In `SpecFormReadTabs`, replace:

```tsx
			{partition.tabs.map((tab, i) => (
				<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
					<Box pt="4">
						<ReadTab
							tab={tab}
							values={values}
							labels={{
								booleanYes: labels.booleanYes,
								booleanNo: labels.booleanNo,
							}}
						/>
					</Box>
				</Tabs.Content>
			))}
```

with:

```tsx
			{partition.tabs.map((tab, i) => (
				<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
					<Box pt="4">
						<CardedReadTab
							tab={tab}
							values={values}
							labels={{
								booleanYes: labels.booleanYes,
								booleanNo: labels.booleanNo,
							}}
						/>
					</Box>
				</Tabs.Content>
			))}
```

3. In `SpecForm`'s read branch, replace:

```tsx
		if (!partition.hasSections) {
			return (
				<ReadTab
					tab={partition.tabs[0]}
					values={readValues}
					labels={{
						booleanYes: resolvedLabels.booleanYes,
						booleanNo: resolvedLabels.booleanNo,
					}}
				/>
			);
		}
```

with:

```tsx
		if (!partition.hasSections) {
			return (
				<CardedReadTab
					tab={partition.tabs[0]}
					values={readValues}
					labels={{
						booleanYes: resolvedLabels.booleanYes,
						booleanNo: resolvedLabels.booleanNo,
					}}
				/>
			);
		}
```

In `src/renderer/spec-form/search-index.ts`, replace:

```ts
	return tabs.flatMap((tab, tabIndex) =>
		tab.fields
			.filter((field) => includeHidden || !field.config.hidden)
```

with:

```ts
	return tabs.flatMap((tab, tabIndex) =>
		tab.fields
			// Card markers are layout, not fields — they have no focusable
			// control or read-mode row to jump to, so (like section markers,
			// which never appear in tab.fields at all) they are not results.
			.filter((field) => field.field_type !== "card")
			.filter((field) => includeHidden || !field.config.hidden)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/ && npm run typecheck`
Expected: PASS (including the pre-existing search/read suites — the card filter only removes rows that never existed before this branch).

- [ ] **Step 5: Stories + mdx**

In `src/renderer/spec-form/spec-form.stories.tsx`, add after the `dateField` helper:

```tsx
// No `card()` builder exists (cards are authored in SpecEditor via "+ Card"),
// so the carded stories construct the marker directly — exactly what the
// editor's insertCard produces.
function cardMarker(name: string, accessor: string): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		children: null,
		system: false,
	};
}
```

Add after `readSpec`/`readValues`:

```tsx
const cardedSpec = defineSpec([
	cardMarker("Basics", "card_basics"),
	text("title", { name: "Title", required: true }),
	boolean("published", { name: "Published" }),
	cardMarker("", "card_untitled"),
	text("notes", { name: "Notes" }),
	section("SEO", [
		cardMarker("Meta", "card_meta"),
		text("meta_title", { name: "Meta Title" }),
	]),
]);

const cardedReadValues: Record<string, unknown> = {
	title: "Launch Announcement",
	published: true,
	notes: "Ship it.",
	meta_title: "Launch Announcement — SEO Title",
};
```

Add at the end of the stories:

```tsx
export const Carded: Story = {
	render: () => <EditWrapper spec={cardedSpec} />,
};

export const CardedReadMode: Story = {
	render: () => <ReadWrapper spec={cardedSpec} values={cardedReadValues} />,
};
```

In `src/renderer/spec-form/spec-form.mdx`, add a new section between "Section Partitioning" and "Mounted-Hidden Panels":

```mdx
## Card Layout

A `card` field is a layout marker one level below `section`: within a tab,
fields after a `card` marker belong to that card until the next `card` or
`section` marker (`partitionTabByCards`, pure and shared with the spec
editor). Cards are purely visual — fields keep their top-level accessors
and stored values are byte-identical with or without markers.

- **Stacked**: one full-width card per row, in schema order — no
  side-by-side grid, no per-card widths.
- **Title optional**: the marker's `config.name`, rendered as a small
  heading when non-empty; an untitled card is a plain box with no header.
- **All-in-cards per tab**: once a tab contains a card marker, every field
  in that tab should live in a card. `validateSpec` flags violations per
  loose field (`loose_field_in_carded_tab`) — but **rendering never breaks
  on a violation** (normative): leading loose fields render as an implicit
  untitled card.
- Tabs without cards render exactly as before — no wrapper element.
- Read mode renders the same card boxes with description-list rows inside.
- Field search, cross-tab jump, submit-jump-to-first-error, and tab error
  badges are unchanged — they operate on the flat field list and DOM ids;
  card markers are never search results.
- The loading skeleton draws its rows inside card frames when the first
  tab has cards.
- `EditDrawer` inherits cards through `SpecForm`; `SpecDataTable` ignores
  card markers exactly as it ignores sections.

<Canvas of={Stories.Carded} />

### Carded, read mode

<Canvas of={Stories.CardedReadMode} />
```

Run: `npm run build:storybook`
Expected: builds clean (catches mdx/story reference typos).

- [ ] **Step 6: Full test + commit**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/renderer/spec-form/
git commit -m "feat(renderer): card read-mode parity, search filter, docs"
```

---

### Task 5: draft ops — insertCard, moveCard, deleteCardMerge, deleteCardWithFields

**Files:**
- Modify: `src/editor/draft-ops.ts` (append after `moveFieldToSection`, using the file's existing `insertFieldAt`, `flatInsertIndex`, `nextAccessor`, `removeFieldAt`, `moveField`, and the already-imported `partitionSchemaBySections`)
- Test: Create `src/editor/__tests__/draft-ops-cards.test.ts`

**Interfaces:**
- Consumes: `partitionSchemaBySections`, existing draft-ops internals; the `"card"` field_type (Task 1).
- Produces (Task 6a/6b import these from `./draft-ops`):
  - `insertCard(schema: Schema, tabIndex: number): Schema` — appends an untitled empty card marker at the end of tab `tabIndex`; if the tab has loose fields and NO cards yet, first auto-wraps them by inserting another untitled marker at the tab's start (Decision 4). Contract: the NEW empty card is always the LAST card marker of the target tab. Out-of-range tab → same reference.
  - `moveCard(schema: Schema, cardAccessor: string, targetCardAccessor: string, position: "before" | "after"): Schema` — moves the card BLOCK (marker + contained fields, bounded by the next `card`/`section` marker) to before/after the target card's block. Missing card/target or self-target → same reference.
  - `deleteCardMerge(schema: Schema, cardAccessor: string): Schema` — removes only the marker; fields merge into the previous card; a FIRST card's fields merge into the next card (its marker is hoisted above them); the ONLY card returns the tab to the bare card-less state. Missing card → same reference.
  - `deleteCardWithFields(schema: Schema, cardAccessor: string): Schema` — removes the whole block. Missing card → same reference.
- All four are pure (never mutate the input) and ride the existing `apply`/undo/dirty machinery unchanged.

- [ ] **Step 1: Write the failing tests**

Create `src/editor/__tests__/draft-ops-cards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Field, Schema } from "../../schema/types";
import {
	deleteCardMerge,
	deleteCardWithFields,
	insertCard,
	moveCard,
} from "../draft-ops";

function f(accessor: string, type = "text"): Field {
	return {
		field_type: type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: type === "section" || type === "card" ? {} : null,
		system: false,
	};
}
const s = (accessor: string) => f(accessor, "section");
const c = (accessor: string) => f(accessor, "card");
const ids = (schema: Schema) =>
	schema.map((x) => `${x.field_type}:${x.config.api_accessor}`);

describe("insertCard", () => {
	it("first card in a tab with loose fields WRAPS them, then appends the new card", () => {
		const schema: Schema = [f("a"), f("b")];
		const out = insertCard(schema, 0);
		// A skipped wrap would produce [a, b, card] — loose fields in a carded
		// tab — so this assertion discriminates the auto-wrap itself.
		expect(ids(out)).toEqual(["card:card", "text:a", "text:b", "card:card_2"]);
		// Both markers are untitled (Decision 3/4 — naming happens in the panel).
		expect(out[0].config.name).toBe("");
		expect(out[3].config.name).toBe("");
		expect(schema).toHaveLength(2); // pure
	});

	it("appends WITHOUT wrapping when the tab already has cards", () => {
		const schema: Schema = [c("c1"), f("a")];
		const out = insertCard(schema, 0);
		expect(ids(out)).toEqual(["card:c1", "text:a", "card:card"]);
	});

	it("appends a single marker to an empty tab (no wrap)", () => {
		const schema: Schema = [s("s1")];
		const out = insertCard(schema, 0);
		expect(ids(out)).toEqual(["section:s1", "card:card"]);
	});

	it("targets the requested tab in a sectioned schema", () => {
		const schema: Schema = [f("a"), s("s1"), f("b")];
		const out = insertCard(schema, 1);
		expect(ids(out)).toEqual([
			"text:a", // implicit tab untouched
			"section:s1",
			"card:card", // wrap for "b"
			"text:b",
			"card:card_2", // the new empty card, LAST card of the tab
		]);
	});

	it("returns the same reference for an out-of-range tab", () => {
		const schema: Schema = [f("a")];
		expect(insertCard(schema, 5)).toBe(schema);
		expect(insertCard([], 0)).toEqual([]);
	});
});

describe("moveCard", () => {
	it("moves the marker AND its contained fields as one block (after)", () => {
		const schema: Schema = [c("c1"), f("a"), f("b"), c("c2"), f("x")];
		const out = moveCard(schema, "c1", "c2", "after");
		// A marker-only move would leave a/b behind under c2.
		expect(ids(out)).toEqual([
			"card:c2",
			"text:x",
			"card:c1",
			"text:a",
			"text:b",
		]);
		expect(ids(schema)).toEqual([
			"card:c1",
			"text:a",
			"text:b",
			"card:c2",
			"text:x",
		]); // pure
	});

	it('"before" places the block ahead of the target block', () => {
		const schema: Schema = [c("c1"), f("a"), c("c2"), f("x")];
		const out = moveCard(schema, "c2", "c1", "before");
		expect(ids(out)).toEqual(["card:c2", "text:x", "card:c1", "text:a"]);
	});

	it("a card block ends at a section marker", () => {
		const schema: Schema = [c("c1"), f("a"), s("s1"), c("c2"), f("x")];
		const out = moveCard(schema, "c2", "c1", "before");
		// c1's block is [c1, a] only — s1 stays put.
		expect(ids(out)).toEqual([
			"card:c2",
			"text:x",
			"card:c1",
			"text:a",
			"section:s1",
		]);
	});

	it("no-ops (same reference) for self, missing card, or missing target", () => {
		const schema: Schema = [c("c1"), f("a"), c("c2")];
		expect(moveCard(schema, "c1", "c1", "after")).toBe(schema);
		expect(moveCard(schema, "nope", "c2", "after")).toBe(schema);
		expect(moveCard(schema, "c1", "nope", "after")).toBe(schema);
	});
});

describe("deleteCardMerge", () => {
	it("merges into the PREVIOUS card (marker-only removal)", () => {
		const schema: Schema = [c("c1"), f("a"), c("c2"), f("b")];
		const out = deleteCardMerge(schema, "c2");
		expect(ids(out)).toEqual(["card:c1", "text:a", "text:b"]);
	});

	it("first card: fields merge into the NEXT card (its marker is hoisted)", () => {
		const schema: Schema = [c("c1"), f("a"), c("c2"), f("b")];
		const out = deleteCardMerge(schema, "c1");
		// "a" must NOT end up loose before c2's marker.
		expect(ids(out)).toEqual(["card:c2", "text:a", "text:b"]);
	});

	it("only card: the tab returns to the bare card-less state", () => {
		const schema: Schema = [s("s1"), c("c1"), f("a"), f("b")];
		const out = deleteCardMerge(schema, "c1");
		expect(ids(out)).toEqual(["section:s1", "text:a", "text:b"]);
	});

	it("first-card merge is tab-scoped (a previous tab's card doesn't count)", () => {
		const schema: Schema = [c("c0"), f("z"), s("s1"), c("c1"), f("a")];
		const out = deleteCardMerge(schema, "c1");
		// c1 is the FIRST card of ITS tab; there is no next card → bare state.
		expect(ids(out)).toEqual([
			"card:c0",
			"text:z",
			"section:s1",
			"text:a",
		]);
	});

	it("no-ops for a missing card", () => {
		const schema: Schema = [c("c1"), f("a")];
		expect(deleteCardMerge(schema, "nope")).toBe(schema);
	});
});

describe("deleteCardWithFields", () => {
	it("removes the marker and every contained field", () => {
		const schema: Schema = [c("c1"), f("a"), c("c2"), f("b")];
		const out = deleteCardWithFields(schema, "c1");
		expect(ids(out)).toEqual(["card:c2", "text:b"]);
		expect(schema).toHaveLength(4); // pure
	});

	it("stops at a section boundary", () => {
		const schema: Schema = [c("c1"), f("a"), s("s1"), f("z")];
		const out = deleteCardWithFields(schema, "c1");
		expect(ids(out)).toEqual(["section:s1", "text:z"]);
	});

	it("no-ops for a missing card", () => {
		const schema: Schema = [f("a")];
		expect(deleteCardWithFields(schema, "nope")).toBe(schema);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/__tests__/draft-ops-cards.test.ts`
Expected: FAIL — `insertCard`/`moveCard`/`deleteCardMerge`/`deleteCardWithFields` are not exported from `../draft-ops`.

- [ ] **Step 3: Implement**

Append to `src/editor/draft-ops.ts`:

```ts
/** A card block = the marker plus every field up to the next `card` or
 * `section` marker (cards never span tabs) — the card-layout sibling of
 * `sectionBlockRange`. */
function cardBlockRange(
	schema: Schema,
	cardAccessor: string,
): [number, number] | null {
	const start = schema.findIndex(
		(f) => f.field_type === "card" && f.config.api_accessor === cardAccessor,
	);
	if (start === -1) return null;
	let end = schema.length;
	for (let i = start + 1; i < schema.length; i++) {
		if (schema[i].field_type === "card" || schema[i].field_type === "section") {
			end = i;
			break;
		}
	}
	return [start, end];
}

/**
 * Appends an untitled, empty card to the end of tab `tabIndex`. Decision 4
 * (all-in-cards): adding the FIRST card to a tab that already has loose
 * fields first wraps them by inserting another untitled marker at the tab's
 * start, THEN appends the new card after them. Contract relied on by the
 * canvas: the NEW empty card is always the LAST card marker of the target
 * tab. Markers are untitled (name "") — the title is optional and authored
 * in the config panel — with accessors from `nextAccessor(…, "card")`
 * (card, card_2, card_3, …).
 */
export function insertCard(schema: Schema, tabIndex: number): Schema {
	const partition = partitionSchemaBySections(schema);
	const tab = partition.tabs[tabIndex];
	if (!tab) return schema;

	const makeMarker = (current: Schema): Field => ({
		field_type: "card",
		config: {
			name: "",
			api_accessor: nextAccessor(current, "card"),
			required: false,
			instructions: "",
		},
		settings: {},
		system: false,
	});

	let next = schema;
	const hasCards = tab.fields.some((f) => f.field_type === "card");
	if (!hasCards && tab.fields.length > 0) {
		next = insertFieldAt(
			next,
			makeMarker(next),
			flatInsertIndex(next, partition, tabIndex, 0),
		);
	}

	// Re-partition: the wrap marker (if inserted) changed the tab's length.
	const nextPartition = partitionSchemaBySections(next);
	return insertFieldAt(
		next,
		makeMarker(next),
		flatInsertIndex(
			next,
			nextPartition,
			tabIndex,
			nextPartition.tabs[tabIndex].fields.length,
		),
	);
}

/**
 * Block move for the card header's drag handle: relocates marker + contained
 * fields as ONE unit, snapped to the target card's block boundary — an
 * arbitrary mid-card insertion would split the target card (fields after the
 * insertion point would silently change owners in the flat model).
 */
export function moveCard(
	schema: Schema,
	cardAccessor: string,
	targetCardAccessor: string,
	position: "before" | "after",
): Schema {
	if (cardAccessor === targetCardAccessor) return schema;
	const range = cardBlockRange(schema, cardAccessor);
	if (!range) return schema;
	const [start, end] = range;
	const block = schema.slice(start, end);
	const rest = [...schema.slice(0, start), ...schema.slice(end)];
	const targetRange = cardBlockRange(rest, targetCardAccessor);
	if (!targetRange) return schema;
	const insertAt = position === "before" ? targetRange[0] : targetRange[1];
	return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
}

/**
 * "Delete card" (non-destructive): removes ONLY the marker.
 * - A previous card exists in the same tab → its fields absorb them (flat
 *   order already does this once the marker is gone).
 * - FIRST card of its tab with another card after it → the next card's
 *   marker is hoisted above the orphaned fields, so they merge into the
 *   NEXT card instead of going loose (which would violate all-in-cards).
 * - ONLY card of its tab → the tab returns to the bare card-less state,
 *   which is legal again.
 */
export function deleteCardMerge(schema: Schema, cardAccessor: string): Schema {
	const range = cardBlockRange(schema, cardAccessor);
	if (!range) return schema;
	const [start, end] = range;

	// A preceding card marker before any section boundary means a previous
	// card exists in the SAME tab — plain marker removal merges into it.
	for (let i = start - 1; i >= 0; i--) {
		if (schema[i].field_type === "section") break;
		if (schema[i].field_type === "card") {
			return removeFieldAt(schema, start);
		}
	}

	// First card of its tab. cardBlockRange guarantees schema[end] is the
	// next card marker, a section marker, or past the end.
	const nextIsCard = end < schema.length && schema[end].field_type === "card";
	const without = removeFieldAt(schema, start);
	if (!nextIsCard) return without; // only card → bare card-less tab
	// In `without` the next marker sits at end-1; hoist it to `start` so the
	// orphaned fields join the NEXT card (at its front).
	return moveField(without, end - 1, start);
}

/** "Delete card and fields" (destructive; caller confirms): removes the
 * whole block — marker and every contained field. */
export function deleteCardWithFields(
	schema: Schema,
	cardAccessor: string,
): Schema {
	const range = cardBlockRange(schema, cardAccessor);
	if (!range) return schema;
	const [start, end] = range;
	return [...schema.slice(0, start), ...schema.slice(end)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/editor/__tests__/draft-ops-cards.test.ts src/editor/__tests__/draft-ops.test.ts && npm run typecheck`
Expected: PASS (all new cases; no regressions in the existing draft-ops suite).

- [ ] **Step 5: Full test + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/draft-ops.ts src/editor/__tests__/draft-ops-cards.test.ts
git commit -m "feat(editor): card draft ops - insert, move, delete-merge"
```

---

### Task 6a: canvas card frames, "+ Card", block drag, labels

**Files:**
- Create: `src/editor/card-frame.tsx`
- Modify: `src/editor/spec-editor.tsx` (`EditorLabels` interface after the `moveToSection` member at line 72; error-message block at lines 131-135; `DEFAULT_EDITOR_LABELS` after `moveToSection` at line 189 and after `errorEmptyAccessor` at line 234)
- Modify: `src/editor/editor-canvas.tsx` (imports; `CanvasLabels` Pick at lines 101-124; new `owningCard` module helper; `handleAddCard` + `addCardButton`; `handleDragEnd` at lines 465-493; picker filter at line 624; `renderFields` at lines 635-691; the two `addSectionButton` placements at lines 722-726 and 840)
- Modify: `src/editor/__tests__/editor-helpers.tsx` (add `makeCard` + card test plugin)
- Test: Create `src/editor/__tests__/cards-canvas.test.tsx`

**Interfaces:**
- Consumes: `insertCard`, `moveCard` (Task 5); `partitionTabByCards` (Task 2); `CardSurface` from `../renderer/spec-form/card-surface` (Task 4a); dnd-kit `useSortable` (per `docs/dnd-kit-reference.md` conventions: `PointerSensor` distance 8 + `KeyboardSensor` already configured in the canvas; `setNodeRef` on the container, `attributes`+`listeners` on the handle button; `CSS.Transform.toString`; `GripVertical` icon; accessor strings as sortable ids).
- Produces:
  - `CardFrame({ card, selected, onSelect, menu, labels, children })` (editor-internal) — header-bar frame: drag handle (block move), title or italic untitled placeholder, optional `menu` slot (Task 6b fills it), header click/Enter/Space selects.
  - `EditorLabels` gains ALL card keys (some consumed only in Task 6b, defined here in one coherent bundle): `addCard`, `cardUntitled`, `dragCard`, `cardMenu`, `renameCard`, `deleteCardMerge`, `deleteCardWithFields`, `deleteCardWithFieldsConfirm`, `panelCardNotice`, `errorLooseFieldInCardedTab`.
  - The canvas stays ONE flat sortable list per tab (`SortableContext items` = every accessor in `tab.fields`, markers included); card frames are presentation only. Insertion boundaries keep speaking `flatInsertIndex`'s "position within tab.fields" dialect, where a marker occupies one position.

- [ ] **Step 1: Write the failing tests**

First extend `src/editor/__tests__/editor-helpers.tsx`. Add after `makeSection`:

```ts
export function makeCard(accessor: string, name = ""): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		system: false,
	};
}
```

and add to `testPlugins` (after the section entry):

```ts
	{
		id: "card",
		name: "Card",
		description: "Structural",
		icon: () => null,
		category: "structural",
		fieldComponent: () => null,
		toZodType: () => z.never(),
	},
```

Create `src/editor/__tests__/cards-canvas.test.tsx`:

```tsx
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import {
	act,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { useSpecDraft } from "../use-spec-draft";
import {
	EditorWrap,
	makeCard,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

// anker's Menu/Tooltip positioning relies on @floating-ui/dom's autoUpdate,
// which requires ResizeObserver and IntersectionObserver — both unimplemented
// in jsdom. Stub them locally, mirroring dnd.test.tsx's rationale.
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
class MockIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

const LABELS = {
	defaultTab: "General",
	searchPlaceholder: "Find field…",
	noResults: "No fields found",
	hiddenField: "Hidden field:",
	groupPreview: "Repeating group",
	addField: "Add field",
	emptySpec: "No fields yet. Add the first one:",
	dragField: "Drag to reorder",
	editField: "Edit field",
	duplicateField: "Duplicate field",
	deleteField: "Delete field",
	systemLocked: "System field",
	moveToSection: "Move to section",
	renameSection: "Rename",
	moveLeft: "Move left",
	moveRight: "Move right",
	deleteSection: "Delete section",
	deleteSectionConfirm:
		'Delete section "{section}"? Its fields move to the previous tab.',
	orientationH: "Horizontal tabs",
	orientationV: "Vertical tabs",
	sectionMenu: "Section menu: {section}",
	addSection: "+ Section",
	newSectionName: "New section",
	sectionNameInput: "Section name",
	addCard: "+ Card",
	cardUntitled: "Untitled card",
	dragCard: "Drag to move card",
	cardMenu: "Card menu: {card}",
	renameCard: "Rename",
	deleteCardMerge: "Delete card",
	deleteCardWithFields: "Delete card and fields",
	deleteCardWithFieldsConfirm: 'Delete card "{card}" and all of its fields?',
};

function Harness({
	schema,
	onSelectSpy,
	onEditSpy,
}: {
	schema: Schema;
	onSelectSpy?: (a: string | null) => void;
	onEditSpy?: (a: string) => void;
}) {
	const spec = useSpecDraft(schema, testPlugins, vi.fn());
	const [selected, setSelected] = useState<string | null>(null);
	return (
		<ConfirmModalProvider>
			<EditorCanvas
				spec={spec}
				plugins={testPlugins}
				selectedAccessor={selected}
				onSelect={(a) => {
					onSelectSpy?.(a);
					setSelected(a);
				}}
				onEdit={(a) => {
					onEditSpy?.(a);
					setSelected(a);
				}}
				labels={LABELS}
			/>
		</ConfirmModalProvider>
	);
}

describe("EditorCanvas — cards", () => {
	it("+ Card auto-wraps loose fields into an untitled card, then appends a new empty card", async () => {
		const onEditSpy = vi.fn();
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeField("b")]}
					onEditSpy={onEditSpy}
				/>
			</EditorWrap>,
		);

		await act(async () => {
			fireEvent.click(screen.getByText("+ Card"));
		});

		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(frames).toHaveLength(2);
		// The wrap card holds BOTH loose fields — a skipped wrap would leave
		// one frame with the shells outside any frame.
		expect(within(frames[0]).getByTestId("shell-a")).toBeInTheDocument();
		expect(within(frames[0]).getByTestId("shell-b")).toBeInTheDocument();
		expect(within(frames[1]).queryAllByTestId(/^shell-/)).toEqual([]);
		// Both markers are untitled → italic placeholder in each header.
		expect(screen.getAllByText("Untitled card")).toHaveLength(2);
		// The NEW card ("card_2" — the wrap took "card") goes through onEdit,
		// which selects it AND pulses the panel's Name autofocus.
		expect(onEditSpy).toHaveBeenCalledWith("card_2");
	});

	it("+ Card appends to the ACTIVE tab only", async () => {
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeSection("s1", "SEO"), makeField("b")]}
				/>
			</EditorWrap>,
		);
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});
		await act(async () => {
			fireEvent.click(screen.getByText("+ Card"));
		});

		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(frames).toHaveLength(2); // wrap for "b" + new card, both in SEO
		const seoPanel = screen
			.getByTestId("shell-b")
			.closest("[role='tabpanel']");
		for (const frame of frames) {
			expect(frame.closest("[role='tabpanel']")).toBe(seoPanel);
		}
		// The implicit General tab keeps its loose field un-carded.
		expect(
			screen.getByTestId("shell-a").closest("[data-testid^='card-frame-']"),
		).toBeNull();
	});

	it("clicking a card header selects the card", () => {
		const onSelectSpy = vi.fn();
		render(
			<EditorWrap>
				<Harness
					schema={[makeCard("c1", "Basics"), makeField("a")]}
					onSelectSpy={onSelectSpy}
				/>
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("card-header-c1"));
		expect(onSelectSpy).toHaveBeenCalledWith("c1");
	});

	it("titled headers show the name; the ⊕ picker never offers the card type", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeCard("c1", "Basics"), makeField("a")]} />
			</EditorWrap>,
		);
		expect(
			within(screen.getByTestId("card-header-c1")).getByText("Basics"),
		).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getAllByLabelText("Add field")[0]);
		});
		expect(await screen.findByTestId("type-option-text")).toBeInTheDocument();
		expect(
			screen.queryByTestId("type-option-card"),
		).not.toBeInTheDocument();
	});

	it("card header drag block-moves the marker WITH its contained fields", async () => {
		// jsdom lays out nothing — fake rects. Frames sit in a column at x=0;
		// shells are pushed far right (x=1000) so sortableKeyboardCoordinates
		// resolves ArrowDown from card c1 to card c2 (the closest droppable
		// below), not to a shell. (Even if it resolved to shell-b, the drop
		// handler maps it to its OWNING card c2 — same result.)
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: Element) {
				const rect = (top: number, left: number) =>
					({
						top,
						left,
						width: 100,
						height: 50,
						bottom: top + 50,
						right: left + 100,
						x: left,
						y: top,
						toJSON() {
							return this;
						},
					}) as DOMRect;
				const testId = this.getAttribute("data-testid") ?? "";
				if (testId.startsWith("card-frame-")) {
					const frames = Array.from(
						document.querySelectorAll('[data-testid^="card-frame-"]'),
					);
					return rect(frames.indexOf(this) * 300, 0);
				}
				if (testId.startsWith("shell-")) {
					const shells = Array.from(
						document.querySelectorAll('[data-testid^="shell-"]'),
					);
					return rect(60 + shells.indexOf(this) * 300, 1000);
				}
				return rect(0, 0);
			});

		const { container } = render(
			<EditorWrap>
				<Harness
					schema={[
						makeCard("c1", "One"),
						makeField("a"),
						makeCard("c2", "Two"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = screen.getAllByLabelText("Drag to move card")[0];
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		// dnd-kit's KeyboardSensor attaches its document keydown listener in a
		// setTimeout after activation — yield a macrotask before the next key.
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowDown" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		// The whole block moved: c2's frame (with shell-b) now precedes c1's
		// (with shell-a). A marker-only move would strand shell-a under c2.
		const order = Array.from(
			container.querySelectorAll(
				'[data-testid^="card-frame-"], [data-testid^="shell-"]',
			),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual([
			"card-frame-c2",
			"shell-b",
			"card-frame-c1",
			"shell-a",
		]);

		rectSpy.mockRestore();
	});

	it("releasing a card header over a tab trigger is a no-op", async () => {
		// Tab-trigger drop zones along the top row; frames/shells below —
		// lifting c1 and pressing ArrowUp resolves to tabdrop-0. Without the
		// guard, moveFieldToSection would relocate only the MARKER.
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: Element) {
				const rect = (top: number, left: number) =>
					({
						top,
						left,
						width: 100,
						height: 40,
						bottom: top + 40,
						right: left + 100,
						x: left,
						y: top,
						toJSON() {
							return this;
						},
					}) as DOMRect;
				const testId = this.getAttribute("data-testid") ?? "";
				if (testId.startsWith("tabdrop-")) {
					return rect(0, Number(testId.slice("tabdrop-".length)) * 200);
				}
				if (testId.startsWith("card-frame-")) {
					const frames = Array.from(
						document.querySelectorAll('[data-testid^="card-frame-"]'),
					);
					return rect(100 + frames.indexOf(this) * 300, 0);
				}
				if (testId.startsWith("shell-")) {
					const shells = Array.from(
						document.querySelectorAll('[data-testid^="shell-"]'),
					);
					return rect(160 + shells.indexOf(this) * 300, 1000);
				}
				return rect(0, 0);
			});

		const { container } = render(
			<EditorWrap>
				<Harness
					schema={[
						makeCard("c1", "One"),
						makeField("a"),
						makeSection("s1", "SEO"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = screen.getByLabelText("Drag to move card");
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		const order = Array.from(
			container.querySelectorAll(
				'[data-testid^="card-frame-"], [data-testid^="shell-"]',
			),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual(["card-frame-c1", "shell-a", "shell-b"]);

		rectSpy.mockRestore();
	});

	it("an empty card shows an always-visible insertion point scoped to its body", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeCard("c1", "Basics")]} />
			</EditorWrap>,
		);
		const frame = screen.getByTestId("card-frame-c1");
		expect(
			within(frame).getByLabelText("Add field"),
		).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/__tests__/cards-canvas.test.tsx`
Expected: FAIL — TypeScript rejects the LABELS object (unknown card keys on `CanvasLabels`) and/or no "+ Card" button / `card-frame-*` testids render.

- [ ] **Step 3: Implement — labels (spec-editor.tsx)**

In `src/editor/spec-editor.tsx`, `EditorLabels` interface — insert after the line `moveToSection?: string;`:

```ts
	// cards
	addCard?: string;
	/** Placeholder title for an untitled card (canvas header, panel, menu aria). */
	cardUntitled?: string;
	/** aria-label/tooltip for a card header's drag handle (block move). */
	dragCard?: string;
	cardMenu?: string; // "{card}" interpolated aria-label for the ⋯ trigger
	renameCard?: string;
	/** Menu item: removes the marker only — fields merge into a neighbor card. */
	deleteCardMerge?: string;
	deleteCardWithFields?: string;
	deleteCardWithFieldsConfirm?: string; // "{card}" interpolated
	/** Notice atop the card config panel (a card's only setting is its Name). */
	panelCardNotice?: string;
```

and extend the validation-message block — replace:

```ts
	// validation messages by SpecFieldErrorCode ("{accessor}" interpolated)
	errorDuplicateAccessor?: string;
	errorEmptyName?: string;
	errorEmptyAccessor?: string;
```

with:

```ts
	// validation messages by SpecFieldErrorCode ("{accessor}" interpolated)
	errorDuplicateAccessor?: string;
	errorEmptyName?: string;
	errorEmptyAccessor?: string;
	errorLooseFieldInCardedTab?: string;
```

In `DEFAULT_EDITOR_LABELS` — insert after the line `moveToSection: "Move to section",`:

```ts
	addCard: "+ Card",
	cardUntitled: "Untitled card",
	dragCard: "Drag to move card",
	cardMenu: "Card menu: {card}",
	renameCard: "Rename",
	deleteCardMerge: "Delete card",
	deleteCardWithFields: "Delete card and fields",
	deleteCardWithFieldsConfirm: 'Delete card "{card}" and all of its fields?',
	panelCardNotice:
		"Card — a visual group. Fields inside keep their own accessors and stored values.",
```

and replace:

```ts
	errorDuplicateAccessor: 'Duplicate accessor "{accessor}"',
	errorEmptyName: "Name must not be empty",
	errorEmptyAccessor: "Accessor must not be empty",
};
```

with:

```ts
	errorDuplicateAccessor: 'Duplicate accessor "{accessor}"',
	errorEmptyName: "Name must not be empty",
	errorEmptyAccessor: "Accessor must not be empty",
	errorLooseFieldInCardedTab: 'Field "{accessor}" must be inside a card',
};
```

- [ ] **Step 4: Implement — CardFrame**

Create `src/editor/card-frame.tsx`:

```tsx
// src/editor/card-frame.tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconButton } from "@knkcs/anker/atoms";
import { Tooltip } from "@knkcs/anker/primitives";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { Field } from "../schema/types";
import type { EditorLabels } from "./spec-editor";

/** Already-flat EditorLabels key names (same pattern as FieldShell's
 * toolbar labels) — a host's merged EditorLabels satisfies this
 * structurally with no renaming layer. */
export type CardFrameLabels = Pick<
	Required<EditorLabels>,
	"cardUntitled" | "dragCard"
>;

export interface CardFrameProps {
	card: Field;
	selected: boolean;
	onSelect: (accessor: string) => void;
	/** The ⋯ menu node; the canvas builds it (it owns the delete flows). */
	menu?: ReactNode;
	labels: CardFrameLabels;
	children: ReactNode;
}

/**
 * Build-canvas card frame (Decision 5, header-bar treatment): every card
 * renders a header row — drag handle (moves the WHOLE card block), title
 * (italic `cardUntitled` placeholder when empty), ⋯ menu. Header click
 * selects the card; the body renders the normal field shells unchanged.
 * The frame is a sortable item in the tab's ONE flat list (id = the card
 * marker's accessor): `setNodeRef` on the frame, listeners on the handle —
 * per docs/dnd-kit-reference.md.
 */
export function CardFrame({
	card,
	selected,
	onSelect,
	menu,
	labels,
	children,
}: CardFrameProps) {
	const accessor = card.config.api_accessor;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: accessor });
	const title = card.config.name.trim();

	return (
		<Box
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			opacity={isDragging ? 0.6 : 1}
			bg="bg-surface"
			borderWidth="2px"
			borderColor={selected ? "accent" : "border"}
			borderRadius="lg"
			boxShadow="sm"
			data-testid={`card-frame-${accessor}`}
		>
			<Flex
				align="center"
				gap="2"
				px="3"
				py="2"
				borderBottomWidth="1px"
				borderColor="border"
				bg="bg-subtle"
				borderTopRadius="lg"
				cursor="pointer"
				role="button"
				tabIndex={0}
				aria-label={title || labels.cardUntitled}
				data-testid={`card-header-${accessor}`}
				onClick={() => onSelect(accessor)}
				onKeyDown={(e) => {
					// Only keys aimed at the header itself; keys from the handle or
					// menu must neither select the card nor be blocked from
					// dnd-kit's document-level keyboard listener.
					if (e.target !== e.currentTarget) return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onSelect(accessor);
					}
				}}
			>
				{/* closeOnEscape=false: an open tooltip's Escape handler would
				    otherwise swallow the Escape that cancels a keyboard drag
				    (same rationale as FieldShell's drag handle). */}
				<Tooltip content={labels.dragCard} closeOnEscape={false}>
					<IconButton
						aria-label={labels.dragCard}
						size="2xs"
						variant="ghost"
						{...attributes}
						{...listeners}
					>
						<GripVertical size={14} />
					</IconButton>
				</Tooltip>
				{title ? (
					<Text fontSize="sm" fontWeight="semibold" flex="1">
						{title}
					</Text>
				) : (
					<Text fontSize="sm" color="fg.muted" fontStyle="italic" flex="1">
						{labels.cardUntitled}
					</Text>
				)}
				{menu && (
					// The menu opens on click — it must not also select the card.
					<Box onClick={(e) => e.stopPropagation()}>{menu}</Box>
				)}
			</Flex>
			<Box p="3">{children}</Box>
		</Box>
	);
}
CardFrame.displayName = "CardFrame";
```

- [ ] **Step 5: Implement — editor-canvas.tsx**

1. Imports — extend the schema import block. Replace:

```ts
import { resolveMarkerConvention } from "../schema/marker-convention";
```

with:

```ts
import { resolveMarkerConvention } from "../schema/marker-convention";
import { partitionSchemaBySections } from "../schema/partition";
import { partitionTabByCards } from "../schema/partition-cards";
```

Replace:

```ts
import type { Field } from "../schema/types";
```

with:

```ts
import type { Field, Schema } from "../schema/types";
```

Add to the renderer import area (next to the other `../renderer/spec-form/*` imports):

```ts
import { CardSurface } from "../renderer/spec-form/card-surface";
```

Extend the draft-ops import list — replace:

```ts
import {
	addSection,
	createField,
	deleteSection,
	duplicateField,
	flatInsertIndex,
	insertFieldAt,
	moveField,
	moveFieldToSection,
	moveSection,
	removeFieldAt,
	renameSection,
	setOrientation,
	uniquifyAccessor,
} from "./draft-ops";
```

with:

```ts
import {
	addSection,
	createField,
	deleteSection,
	duplicateField,
	flatInsertIndex,
	insertCard,
	insertFieldAt,
	moveCard,
	moveField,
	moveFieldToSection,
	moveSection,
	removeFieldAt,
	renameSection,
	setOrientation,
	uniquifyAccessor,
} from "./draft-ops";
```

Add after the field-shell import:

```ts
import { CardFrame } from "./card-frame";
```

2. Module-scope helper — add after the `TabDropZone` component:

```ts
/** The card marker owning `field`: the nearest preceding `card` in the
 * flat schema, cut off at a `section` boundary (cards never span tabs).
 * Null for loose fields with no marker before them in their tab. */
function owningCard(schema: Schema, field: Field): Field | null {
	const index = schema.indexOf(field);
	for (let i = index - 1; i >= 0; i--) {
		if (schema[i].field_type === "section") return null;
		if (schema[i].field_type === "card") return schema[i];
	}
	return null;
}
```

3. `CanvasLabels` — replace the line:

```ts
			| "sectionNameInput" // aria-label for the inline rename input
```

with:

```ts
			| "sectionNameInput" // aria-label for the inline rename input
			| "addCard" // "+ Card" button label
			| "cardUntitled" // italic placeholder title for unnamed cards
			| "dragCard" // card header drag handle aria-label (block move)
			| "cardMenu" // "{card}" interpolated — aria-label for the ⋯ trigger
			| "renameCard"
			| "deleteCardMerge" // marker-only delete; fields merge into a neighbor
			| "deleteCardWithFields"
			// "{card}" interpolated — destructive-confirm message
			| "deleteCardWithFieldsConfirm"
```

4. "+ Card" — add directly after the `addSectionButton` definition (lines 541-545):

```tsx
	const handleAddCard = () => {
		const activeIndex = Number(activeTab.replace("tab-", ""));
		// Sectionless canvases have one tab (index 0) and no Tabs.Root driving
		// activeTab — clamp so the untouched "tab-0" default always resolves.
		const tabIndex = Math.min(
			Number.isNaN(activeIndex) ? 0 : activeIndex,
			Math.max(0, partition.tabs.length - 1),
		);
		const next = insertCard(draft, tabIndex);
		if (next === draft) return; // no tab to add to
		apply(next);
		// insertCard's contract: the freshly appended card is the LAST card
		// marker of the target tab — select it via onEdit, which also pulses
		// the panel's Name autofocus so the author can title it immediately.
		const newTab = partitionSchemaBySections(next).tabs[tabIndex];
		const added = [...(newTab?.fields ?? [])]
			.reverse()
			.find((f) => f.field_type === "card");
		if (added) onEdit(added.config.api_accessor);
	};

	const addCardButton = (
		<Button variant="ghost" size="xs" onClick={handleAddCard}>
			{labels.addCard}
		</Button>
	);
```

5. `handleDragEnd` — replace the whole function (lines 465-493) with:

```tsx
	const handleDragEnd = (event: DragEndEvent) => {
		// Before the early returns: every drop ends the drag, valid target or not.
		setDragActive(false);
		const { active, over } = event;
		if (!over) return;
		const activeAccessor = String(active.id);
		const overId = String(over.id);

		// Card block move — checked BEFORE the tabdrop branch: releasing a
		// card header over a tab trigger must be a no-op (moveFieldToSection
		// would relocate only the MARKER, orphaning its fields). v1 has no
		// cross-tab card drag.
		const activeField = draft.find(
			(f) => f.config.api_accessor === activeAccessor,
		);
		if (activeField?.field_type === "card") {
			if (overId.startsWith("tabdrop-")) return;
			const overField = draft.find((f) => f.config.api_accessor === overId);
			if (!overField) return;
			// Resolve the card OWNING the drop target: the target marker
			// itself, or a field's nearest preceding marker — block moves snap
			// to card boundaries (a mid-card insertion would split the target
			// card in the flat model).
			const targetCard =
				overField.field_type === "card"
					? overField
					: owningCard(draft, overField);
			if (!targetCard || targetCard.config.api_accessor === activeAccessor) {
				return;
			}
			const fromIndex = draft.indexOf(activeField);
			const toIndex = draft.indexOf(targetCard);
			apply(
				moveCard(
					draft,
					activeAccessor,
					targetCard.config.api_accessor,
					fromIndex < toIndex ? "after" : "before",
				),
			);
			return;
		}

		if (overId.startsWith("tabdrop-")) {
			const tabIndex = Number(overId.slice("tabdrop-".length));
			// Releasing over the field's OWN tab trigger must be a no-op:
			// moveFieldToSection appends to the target tab, so an unguarded
			// self-drop would silently jump the field to its tab's end.
			const sourceTabIndex = partition.tabs.findIndex((tab) =>
				tab.fields.some((f) => f.config.api_accessor === activeAccessor),
			);
			if (sourceTabIndex === tabIndex) return;
			apply(moveFieldToSection(draft, activeAccessor, tabIndex));
			return;
		}

		if (activeAccessor === overId) return;
		const fromIndex = draft.findIndex(
			(f) => f.config.api_accessor === activeAccessor,
		);
		const toIndex = draft.findIndex((f) => f.config.api_accessor === overId);
		if (fromIndex === -1 || toIndex === -1) return;
		apply(moveField(draft, fromIndex, toIndex));
	};
```

6. ⊕ picker filter — replace (inside `insertionBoundary`):

```tsx
					<TypePickerPopover
						// "section" is inserted only via the strip's "+ Section" button
						// (addSectionButton) — offering it here too would give authors two
						// competing ways to add one, and this path skips the section-marker
						// bookkeeping (addSection) that keeps tabs consistent.
						plugins={plugins.filter((p) => p.id !== "section")}
```

with:

```tsx
					<TypePickerPopover
						// "section"/"card" are inserted only via the strip's "+ Section"
						// and "+ Card" buttons — offering them here too would give
						// authors two competing ways to add one, and this path skips
						// the marker bookkeeping (addSection / insertCard's auto-wrap)
						// that keeps tabs and cards consistent.
						plugins={plugins.filter(
							(p) => p.id !== "section" && p.id !== "card",
						)}
```

7. `renderFields` — replace the whole function (lines 635-691) with:

```tsx
	const renderFields = (fields: Field[], tabIndex: number) => {
		// Keys: plain accessor for the first (usually only) occurrence — a
		// position-dependent key would remount shells on every reorder,
		// tearing down the focused drag handle mid-keyboard-drag. Duplicate
		// accessors (consumer-provided schemas only — the panel gate prevents
		// authoring them) get an occurrence suffix so both shells render
		// instead of colliding as React siblings.
		const occurrences = new Map<string, number>();
		const keyFor = (accessor: string) => {
			const n = occurrences.get(accessor) ?? 0;
			occurrences.set(accessor, n + 1);
			return n === 0 ? accessor : `${accessor}-${n}`;
		};

		const shellFor = (field: Field, tabPosition: number) => (
			<Fragment key={keyFor(field.config.api_accessor)}>
				<Box position="relative">
					{insertionBoundary(tabIndex, tabPosition, "overlay")}
					<FieldShell
						field={field}
						selected={selectedAccessor === field.config.api_accessor}
						invalid={invalidAccessors.has(field.config.api_accessor)}
						onSelect={(a) => onSelect(a)}
						onEdit={onEdit}
						onDuplicate={handleDuplicate}
						// Position-based (F2b): closes over THIS exact field object
						// and its flat-draft index, ignoring whatever accessor
						// FieldShell's internal onClick passes — required so the
						// second of two duplicate-accessor shells deletes only
						// itself, not both.
						onDelete={() => handleDeleteField(field, draft.indexOf(field))}
						duplicateDisabled={isDuplicateDisabled(field)}
						moveMenu={buildMoveMenu(field, tabIndex)}
						labels={labels}
					>
						<ShellContent field={field} labels={labels} />
					</FieldShell>
				</Box>
			</Fragment>
		);

		const cardPartition = partitionTabByCards(fields);

		if (!cardPartition.hasCards) {
			return (
				<SortableContext
					items={fields.map((f) => f.config.api_accessor)}
					strategy={verticalListSortingStrategy}
				>
					<Stack gap="5">
						{fields.map((field, i) => shellFor(field, i))}
						{insertionBoundary(
							tabIndex,
							fields.length,
							"flow",
							fields.length === 0, // empty tab: visible drop zone
						)}
					</Stack>
				</SortableContext>
			);
		}

		// Carded tab. Drag stays ONE-DIMENSIONAL: a single flat sortable list
		// — markers AND fields — regardless of how the frames render them
		// (dropping a field into another card is just crossing the marker in
		// flat order; the card header handle block-moves via handleDragEnd's
		// card branch). `position` runs over tab.fields (markers included) so
		// each insertion boundary keeps speaking flatInsertIndex's
		// position-within-tab dialect.
		let position = 0;
		return (
			<SortableContext
				items={fields.map((f) => f.config.api_accessor)}
				strategy={verticalListSortingStrategy}
			>
				<Stack gap="5">
					{cardPartition.cards.map((group, groupIndex) => {
						if (group.card) position++; // the marker occupies one position
						const bodyStart = position;
						position += group.fields.length;
						const body = (
							<Stack gap="5">
								{group.fields.map((field, j) => shellFor(field, bodyStart + j))}
								{insertionBoundary(
									tabIndex,
									bodyStart + group.fields.length,
									"flow",
									group.fields.length === 0, // empty card: visible drop zone
								)}
							</Stack>
						);
						if (!group.card) {
							// Implicit leading group (hand-written schemas only — the
							// editor never produces loose fields in a carded tab):
							// degrade exactly like the renderer, an untitled frame.
							// validateSpec flags each loose field, so its shell
							// outlines in the danger color inside the frame.
							return (
								<CardSurface key={`implicit-${groupIndex}`}>{body}</CardSurface>
							);
						}
						return (
							<CardFrame
								key={keyFor(group.card.config.api_accessor)}
								card={group.card}
								selected={selectedAccessor === group.card.config.api_accessor}
								onSelect={(a) => onSelect(a)}
								labels={labels}
							>
								{body}
							</CardFrame>
						);
					})}
				</Stack>
			</SortableContext>
		);
	};
```

8. Button placements. Sectionless layout — replace:

```tsx
							<Flex justify="flex-end" mb="5">
								{addSectionButton}
							</Flex>
```

with:

```tsx
							<Flex justify="flex-end" gap="1" mb="5">
								{addCardButton}
								{addSectionButton}
							</Flex>
```

Sectioned layout — replace:

```tsx
								{addSectionButton}
								<FieldSearch
```

with:

```tsx
								<Flex gap="1">
									{addCardButton}
									{addSectionButton}
								</Flex>
								<FieldSearch
```

(The empty-spec state keeps only `addSectionButton` — with zero tabs there is nothing for `insertCard` to target, and a card with no fields in an empty spec is meaningless.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — all 7 new cases green; the existing canvas suites (insertion, dnd, sections, editor-canvas, canvas-markers) unaffected (card-less tabs take the `!hasCards` branch, which renders today's exact tree).

- [ ] **Step 7: Full test + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): card frames, + Card, block drag on canvas"
```

---

### Task 6b: card ⋯ menu, config-panel Name editing, error label, mdx, story

**Files:**
- Create: `src/editor/card-menu.tsx`
- Modify: `src/editor/editor-canvas.tsx` (imports; delete handlers + `buildCardMenu` next to `handleDeleteSection`; pass `menu` to `CardFrame` in `renderFields`)
- Modify: `src/editor/field-config-panel.tsx` (`PanelLabels` Pick at lines 47-77; `Input` import; header title fallback at line 437; card body branch at lines 455+)
- Modify: `src/editor/spec-editor.tsx` (`translateFieldError` at lines 240-251)
- Modify: `src/editor/spec-editor.mdx` (labels table + "Cards" contract section + example canvas)
- Modify: `src/editor/spec-editor.stories.tsx` (BuildWithCards story)
- Test: Create `src/editor/__tests__/cards-editor.test.tsx`

**Interfaces:**
- Consumes: `deleteCardMerge`, `deleteCardWithFields` (Task 5); `CardFrame`'s `menu` slot and the card EditorLabels keys (Task 6a); `useConfirmModal` (already in the canvas); `nameInputRef` + `autoFocusLabel` plumbing (existing panel).
- Produces:
  - `CardMenu({ cardAccessor, onRename, onDeleteMerge, onDeleteWithFields, labels, triggerAriaLabel })` (editor-internal) — items in fixed order: Rename, Delete card, Delete card and fields.
  - `FieldConfigPanel` renders a card-specific body for `field_type === "card"`: notice + a single live-edit Name input (`data-testid="panel-card-name-input"`, wired to `nameInputRef` so Edit/Rename autofocus works), same rename semantics as fields (apply per keystroke, trim on blur); accessor is untouched.
  - `translateFieldError` maps `loose_field_in_carded_tab` → `labels.errorLooseFieldInCardedTab`.

- [ ] **Step 1: Write the failing tests**

Create `src/editor/__tests__/cards-editor.test.tsx` (full SpecEditor — it supplies `DEFAULT_EDITOR_LABELS`, so tests use the English defaults):

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { SpecEditor } from "../spec-editor";
import {
	EditorWrap,
	makeCard,
	makeField,
	testPlugins,
} from "./editor-helpers";

class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
class MockIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

// Menu items select via keyboard (Home/End/arrows + Enter) — jsdom has no
// PointerEvent hover; see sections.test.tsx for the established pattern.
// Card menu order is fixed: Rename, Delete card, Delete card and fields.
async function selectCardMenuItem(item: "rename" | "merge" | "with-fields") {
	const menu = await screen.findByRole("menu");
	await act(async () => {
		fireEvent.keyDown(menu, { key: item === "with-fields" ? "End" : "Home" });
	});
	if (item === "merge") {
		await act(async () => {
			fireEvent.keyDown(menu, { key: "ArrowDown" });
		});
	}
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Enter" });
	});
}

function renderEditor(schema: Schema) {
	return render(
		<EditorWrap>
			<SpecEditor schema={schema} onCommit={vi.fn()} plugins={testPlugins} />
		</EditorWrap>,
	);
}

describe("SpecEditor — card menu, panel, validation surfacing", () => {
	it("header select opens the panel on the card's Name; typing renames the header live", async () => {
		renderEditor([makeCard("c1", "Basics"), makeField("a")]);

		await act(async () => {
			fireEvent.click(screen.getByTestId("card-header-c1"));
		});

		const panel = screen.getByTestId("field-config-panel");
		const nameInput = within(panel).getByTestId("panel-card-name-input");
		expect(nameInput).toHaveValue("Basics");
		// A card's ONLY setting is its name: no accessor/validation controls.
		expect(
			within(panel).queryByTestId("panel-accessor-input"),
		).not.toBeInTheDocument();

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: "Meta" } });
		});
		expect(
			within(screen.getByTestId("card-header-c1")).getByText("Meta"),
		).toBeInTheDocument();
	});

	it("⋯ Rename opens the panel's Name input", async () => {
		renderEditor([makeCard("c1", "Basics"), makeField("a")]);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Card menu: Basics"));
		});
		await selectCardMenuItem("rename");

		expect(
			within(screen.getByTestId("field-config-panel")).getByTestId(
				"panel-card-name-input",
			),
		).toHaveValue("Basics");
	});

	it("Delete card merges its fields into the previous card", async () => {
		renderEditor([
			makeCard("c1", "One"),
			makeField("a"),
			makeCard("c2", "Two"),
			makeField("b"),
		]);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Card menu: Two"));
		});
		await selectCardMenuItem("merge");

		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(frames).toHaveLength(1);
		expect(within(frames[0]).getByTestId("shell-a")).toBeInTheDocument();
		expect(within(frames[0]).getByTestId("shell-b")).toBeInTheDocument();
	});

	it("Delete card and fields destroys the block after the confirm dialog", async () => {
		renderEditor([
			makeCard("c1", "One"),
			makeField("a"),
			makeCard("c2", "Two"),
			makeField("b"),
		]);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Card menu: Two"));
		});
		await selectCardMenuItem("with-fields");

		const confirmButton = await screen.findByRole("button", {
			name: "Confirm",
		});
		await act(async () => {
			fireEvent.click(confirmButton);
		});

		expect(screen.queryByTestId("shell-b")).not.toBeInTheDocument();
		expect(screen.getByTestId("shell-a")).toBeInTheDocument();
		expect(screen.getAllByTestId(/^card-frame-/)).toHaveLength(1);
	});

	it("hand-written loose fields in a carded tab outline invalid and disable Try it", () => {
		renderEditor([makeField("a"), makeCard("c1", "One"), makeField("b")]);

		expect(screen.getByTestId("shell-a")).toHaveAttribute(
			"data-invalid",
			"true",
		);
		expect(screen.getByRole("button", { name: "Try it" })).toBeDisabled();
	});

	it("Try-it smoke: a carded draft renders as a real form with card headings", async () => {
		renderEditor([makeCard("c1", "Basics"), makeField("a", "Alpha")]);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Try it" }));
		});

		const form = screen.getByTestId("try-it-form");
		expect(
			within(form).getByRole("heading", { name: "Basics" }),
		).toBeInTheDocument();
		expect(within(form).getByTestId("field-a")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/__tests__/cards-editor.test.tsx`
Expected: FAIL — no "Card menu:" trigger exists (6a rendered frames without a menu), and selecting the card shows the full field panel (accessor input present, no `panel-card-name-input`).

- [ ] **Step 3: Implement — CardMenu**

Create `src/editor/card-menu.tsx`:

```tsx
// src/editor/card-menu.tsx
import { IconButton } from "@knkcs/anker/atoms";
import {
	MenuContent,
	MenuItem,
	MenuRoot,
	MenuTrigger,
} from "@knkcs/anker/primitives";
import { Ellipsis } from "lucide-react";
import type { EditorLabels } from "./spec-editor";

/** Already-flat EditorLabels key names — no renaming layer needed between
 * EditorLabels and this menu's labels prop (same pattern as SectionMenu). */
export type CardMenuLabels = Pick<
	Required<EditorLabels>,
	"renameCard" | "deleteCardMerge" | "deleteCardWithFields"
>;

export interface CardMenuProps {
	cardAccessor: string;
	/** Rename lives in the config panel (a card's one setting) — the canvas
	 * wires this to onEdit, which selects the card AND pulses the panel's
	 * Name-input autofocus. */
	onRename: (accessor: string) => void;
	/** Non-destructive: removes only the marker — fields merge into the
	 * previous card / the next card (first card) / go bare (only card). */
	onDeleteMerge: (accessor: string) => void;
	onDeleteWithFields: (accessor: string) => void; // caller confirms
	labels: CardMenuLabels;
	/** Pre-interpolated aria-label for the trigger, e.g. "Card menu: Basics". */
	triggerAriaLabel: string;
}

export function CardMenu({
	cardAccessor,
	onRename,
	onDeleteMerge,
	onDeleteWithFields,
	labels,
	triggerAriaLabel,
}: CardMenuProps) {
	return (
		<MenuRoot>
			<MenuTrigger asChild>
				<IconButton aria-label={triggerAriaLabel} size="2xs" variant="ghost">
					<Ellipsis size={12} />
				</IconButton>
			</MenuTrigger>
			<MenuContent>
				<MenuItem value="rename" onSelect={() => onRename(cardAccessor)}>
					{labels.renameCard}
				</MenuItem>
				<MenuItem
					value="delete-merge"
					onSelect={() => onDeleteMerge(cardAccessor)}
				>
					{labels.deleteCardMerge}
				</MenuItem>
				<MenuItem
					value="delete-with-fields"
					color="danger.600"
					onSelect={() => onDeleteWithFields(cardAccessor)}
				>
					{labels.deleteCardWithFields}
				</MenuItem>
			</MenuContent>
		</MenuRoot>
	);
}
CardMenu.displayName = "CardMenu";
```

- [ ] **Step 4: Implement — canvas wiring**

In `src/editor/editor-canvas.tsx`:

1. Extend the draft-ops import list (Task 6a's version) — add `deleteCardMerge,` and `deleteCardWithFields,` in alphabetical position:

```ts
import {
	addSection,
	createField,
	deleteCardMerge,
	deleteCardWithFields,
	deleteSection,
	duplicateField,
	flatInsertIndex,
	insertCard,
	insertFieldAt,
	moveCard,
	moveField,
	moveFieldToSection,
	moveSection,
	removeFieldAt,
	renameSection,
	setOrientation,
	uniquifyAccessor,
} from "./draft-ops";
```

and add after the card-frame import:

```ts
import { CardMenu } from "./card-menu";
```

2. Add directly after `handleDeleteSection` (ends around the `apply(deleteSection(draft, accessor));` line):

```tsx
	const handleDeleteCardMerge = (accessor: string) => {
		if (selectedAccessor === accessor) onSelect(null);
		apply(deleteCardMerge(draft, accessor));
	};

	const handleDeleteCardWithFields = async (accessor: string, name: string) => {
		const ok = await confirm({
			title: labels.deleteCardWithFields,
			message: labels.deleteCardWithFieldsConfirm.replace(
				"{card}",
				name.trim() || labels.cardUntitled,
			),
			colorPalette: "red",
		});
		if (!ok) return;
		// Clearing only a selected MARKER is needed here — a selected field
		// inside the block simply stops resolving (SpecEditor's selectedField
		// lookup misses), which closes the panel on its own.
		if (selectedAccessor === accessor) onSelect(null);
		apply(deleteCardWithFields(draft, accessor));
	};

	const buildCardMenu = (card: Field) => (
		<CardMenu
			cardAccessor={card.config.api_accessor}
			onRename={onEdit}
			onDeleteMerge={handleDeleteCardMerge}
			onDeleteWithFields={(a) =>
				handleDeleteCardWithFields(a, card.config.name)
			}
			labels={labels}
			triggerAriaLabel={labels.cardMenu.replace(
				"{card}",
				card.config.name.trim() || labels.cardUntitled,
			)}
		/>
	);
```

3. In `renderFields`' carded branch (Task 6a's version), extend the `CardFrame` usage — replace:

```tsx
							<CardFrame
								key={keyFor(group.card.config.api_accessor)}
								card={group.card}
								selected={selectedAccessor === group.card.config.api_accessor}
								onSelect={(a) => onSelect(a)}
								labels={labels}
							>
```

with:

```tsx
							<CardFrame
								key={keyFor(group.card.config.api_accessor)}
								card={group.card}
								selected={selectedAccessor === group.card.config.api_accessor}
								onSelect={(a) => onSelect(a)}
								menu={buildCardMenu(group.card)}
								labels={labels}
							>
```

- [ ] **Step 5: Implement — panel card branch + error label**

In `src/editor/field-config-panel.tsx`:

1. Extend the Chakra import — replace:

```ts
import { Box, Flex, Text } from "@chakra-ui/react";
```

with:

```ts
import { Box, Flex, Input, Text } from "@chakra-ui/react";
```

2. Extend `PanelLabels` — replace the two lines:

```ts
	| "patternMessage"
	| "unique"
>;
```

with:

```ts
	| "patternMessage"
	| "unique"
	// Card panel: the one-setting (Name) body.
	| "cardUntitled"
	| "panelCardNotice"
>;
```

3. Header title fallback — replace:

```tsx
					<Text fontWeight="semibold">{activeField.config.name}</Text>
```

with:

```tsx
					<Text fontWeight="semibold">
						{activeField.field_type === "card" &&
						!activeField.config.name.trim()
							? labels.cardUntitled
							: activeField.config.name}
					</Text>
```

4. Card body branch — replace:

```tsx
			{activeField.system ? (
				<SystemFieldSummary
					field={activeField}
					plugin={activePlugin}
					labels={labels}
				/>
			) : (
```

with:

```tsx
			{activeField.field_type === "card" ? (
				// A card's ONE setting is its Name (title, optional) — no
				// accessor/validation/type-settings sections. Live draft edits
				// with the same semantics as field renames: apply per keystroke,
				// trim on blur. The accessor is never touched (no auto-slug).
				// (fieldkit#42's panel→tabs redesign subsumes this trivially.)
				<Box>
					<Text
						fontSize="xs"
						color="fg.muted"
						mb="3"
						data-testid="panel-card-notice"
					>
						{labels.panelCardNotice}
					</Text>
					<Box as="label" display="block" mb="3">
						<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
							{labels.name}
						</Text>
						<Input
							ref={nameInputRef}
							size="sm"
							mt="1"
							value={activeField.config.name}
							placeholder={labels.cardUntitled}
							onChange={(e) =>
								guardedFieldChange({
									...activeField,
									config: { ...activeField.config, name: e.target.value },
								})
							}
							onBlur={() => {
								const trimmed = activeField.config.name.trim();
								if (trimmed !== activeField.config.name) {
									guardedFieldChange({
										...activeField,
										config: { ...activeField.config, name: trimmed },
									});
								}
							}}
							data-testid="panel-card-name-input"
						/>
					</Box>
				</Box>
			) : activeField.system ? (
				<SystemFieldSummary
					field={activeField}
					plugin={activePlugin}
					labels={labels}
				/>
			) : (
```

In `src/editor/spec-editor.tsx`, `translateFieldError` — replace:

```ts
	const template =
		error.code === "duplicate_accessor"
			? labels.errorDuplicateAccessor
			: error.code === "empty_name"
				? labels.errorEmptyName
				: labels.errorEmptyAccessor;
```

with:

```ts
	const template =
		error.code === "duplicate_accessor"
			? labels.errorDuplicateAccessor
			: error.code === "empty_name"
				? labels.errorEmptyName
				: error.code === "loose_field_in_carded_tab"
					? labels.errorLooseFieldInCardedTab
					: labels.errorEmptyAccessor;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — all 6 new cases green, no regressions (field-config-panel, spec-editor, validation-surfacing suites unchanged for non-card fields).

- [ ] **Step 7: Story + mdx**

In `src/editor/spec-editor.stories.tsx`:

1. Extend the types import — replace:

```ts
import type { Schema } from "../schema/types";
```

with:

```ts
import type { Field, Schema } from "../schema/types";
```

2. Add after `sectionedSpec` (top-level helpers area):

```tsx
// Cards are authored via "+ Card" — this marker literal is exactly what
// draft-ops' insertCard produces (plus a name, set via the config panel).
function cardMarker(name: string, accessor: string): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		system: false,
	};
}

const cardedSpec: Schema = [
	cardMarker("Basics", "card_basics"),
	text("title", { name: "Title", required: true }),
	boolean("published", { name: "Published" }),
	cardMarker("", "card_untitled"),
	text("notes", { name: "Notes" }),
	...section("SEO", [
		cardMarker("Meta", "card_meta"),
		text("meta_title", { name: "Meta Title" }),
	]),
];
```

3. Add a story after `SystemFields`:

```tsx
export const BuildWithCards: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={cardedSpec}
			note={
				<>
					The "General" tab groups its fields into two cards (one untitled —
					italic placeholder). Try the card header: drag its handle to move
					the whole card, click it to rename via the panel, or open ⋯ for
					the two delete flavors ("Delete card" merges fields into a
					neighbor; "Delete card and fields" confirms first). "+ Card" on a
					tab with loose fields auto-wraps them. Click <strong>Try it</strong>{" "}
					to see the rendered card layout as a real form.
				</>
			}
		/>
	),
};
```

In `src/editor/spec-editor.mdx`:

1. Add a section after "### Sections & the section menu" (before "### Drag & drop, including cross-tab"):

```mdx
### Cards

A tab's fields can be grouped into stacked, full-width **cards** — `card`
layout markers in the flat schema, one level below sections (fields after a
marker belong to that card until the next `card`/`section` marker). Cards
are purely visual: fields keep their top-level accessors and stored values
are byte-identical with or without markers.

**"+ Card"** (next to "+ Section") appends an empty, untitled card to the
active tab. Adding the FIRST card to a tab that already has loose fields
auto-wraps those fields into an untitled card first, then appends the new
card after it — a carded tab is always all-in-cards. The new card is
selected and the config panel's Name input focused so it can be titled
immediately. A card's title is optional (`config.name`): empty shows the
italic `cardUntitled` placeholder on the canvas and a plain, headerless
card in the rendered form.

Every card renders a **header bar**: a drag handle (moves the whole card —
marker plus contained fields — as one block; the canvas stays a single
flat sortable list, so dragging a *field* between cards is unchanged), the
title, and a ⋯ menu. Clicking the header selects the card; the config
panel then shows its one setting (Name) with the same live-edit semantics
as field renames. The ⋯ menu offers **Rename** (focuses the panel's Name
input), **Delete card** (removes only the marker — its fields merge into
the previous card; a first card's fields merge into the next; deleting the
only card returns the tab to the legal card-less state; nothing is
destroyed), and **Delete card and fields** (destructive, behind the
standard confirm dialog).

Hand-written schemas violating the all-in-cards rule (a loose field before
a tab's first marker) are flagged by `validateSpec` as
`loose_field_in_carded_tab` on each loose field — those shells outline in
the danger color and Save/Try-it disable — while the canvas and renderer
still degrade gracefully by framing them as an implicit untitled card.
The ⊕ insertion popover never offers the `card` type; "+ Card" is the only
way to add one (it owns the auto-wrap bookkeeping).
```

2. Add these rows to the Labels table (after the `moveToSection` row):

```mdx
| `addCard` | `"+ Card"` | Add-card button |
| `cardUntitled` | `"Untitled card"` | Placeholder title for an untitled card (canvas header, panel header/placeholder, menu aria interpolation) |
| `dragCard` | `"Drag to move card"` | Card header drag-handle aria-label/tooltip (moves the whole card block) |
| `cardMenu` | `"Card menu: {card}"` | Card ⋯ menu trigger aria-label (`{card}` interpolated) |
| `renameCard` | `"Rename"` | Card menu item (opens the panel's Name input) |
| `deleteCardMerge` | `"Delete card"` | Card menu item — removes the marker only; fields merge into a neighbor card |
| `deleteCardWithFields` | `"Delete card and fields"` | Card menu item / confirm dialog title |
| `deleteCardWithFieldsConfirm` | `'Delete card "{card}" and all of its fields?'` | Confirm dialog message (`{card}` interpolated) |
| `panelCardNotice` | `"Card — a visual group. Fields inside keep their own accessors and stored values."` | Notice atop the card config panel |
```

and after the `errorEmptyAccessor` row:

```mdx
| `errorLooseFieldInCardedTab` | `'Field "{accessor}" must be inside a card'` | Validation message for a loose field in a carded tab (`{accessor}` interpolated) |
```

3. Add an example after the "Invalid Draft" example:

```mdx
### Build, With Cards

The "General" tab's fields grouped into two cards (one untitled). Card
headers carry a drag handle (block move), the title, and a ⋯ menu; "+ Card"
auto-wraps loose fields on first use in a tab. Flip to **Try it** to see
the rendered card layout.

<Canvas of={Stories.BuildWithCards} />
```

Run: `npm run build:storybook`
Expected: builds clean.

- [ ] **Step 8: Full test + commit**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): card menu, panel naming, labels + docs"
```

---

### Task 7: docs + version 0.8.0

**Files:**
- Modify: `CLAUDE.md` (directory-layout entries)
- Modify: `package.json` (`"version": "0.7.0"` → `"0.8.0"`)
- Modify: `package-lock.json` (via `npm install --package-lock-only`)

**Interfaces:**
- Consumes: everything above.
- Produces: release-ready branch. The tag push / npm publish is NOT part of this plan — only after explicit user OK.

- [ ] **Step 1: CLAUDE.md directory layout**

In the Directory Layout block, replace:

```
│   ├── partition.ts     # partitionSchemaBySections() — shared by SpecForm + editor
│   ├── validate-spec.ts # validateSpec() — maxPerSpec, accessor checks (recursive into group children)
```

with:

```
│   ├── partition.ts     # partitionSchemaBySections() — shared by SpecForm + editor
│   ├── partition-cards.ts # partitionTabByCards() — card layout groups within one tab
│   ├── validate-spec.ts # validateSpec() — maxPerSpec, accessor checks (recursive into group children), card-layout rule
```

and replace:

```
│   ├── field-shell.tsx  # Per-field wrapper: selection, toolbar, inert content
```

with:

```
│   ├── field-shell.tsx  # Per-field wrapper: selection, toolbar, inert content
│   ├── card-frame.tsx   # Card header-bar frame on the canvas (block drag, select)
│   ├── card-menu.tsx    # Card ⋯ menu (rename, delete-merge, delete-with-fields)
```

- [ ] **Step 2: Version bump + lockfile**

In `package.json`, replace `"version": "0.7.0",` with `"version": "0.8.0",` then sync the lockfile:

```bash
npm install --package-lock-only
```

- [ ] **Step 3: Full gates**

Run: `npm run test && npm run typecheck && npm run lint && npm run verify-exports && npm run build && npm run build:storybook`
Expected: all PASS (verify-exports confirms the new `/schema` exports — `cardPlugin`, `partitionTabByCards` + types — land in the built `.d.ts`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md package.json package-lock.json
git commit -m "docs: card layout directory notes; chore: v0.8.0"
```

---

## Post-plan (not tasks)

- Final whole-branch review, then runtime gate in Storybook: `BuildWithCards` (+ Card auto-wrap, header drag block move, ⋯ delete-merge, panel rename, Try-it), `Carded`/`CardedReadMode` (renderer parity, skeleton), and the anker#153 eyeball — inputs are currently transparent; once fixed upstream they render white-on-white inside cards, where the card border still separates them. Then merge to main.
- Release: tag `v0.8.0` push (publish-fieldkit.yml) **only after explicit user OK**.
- mediahub follow-up (file on release, separate repo): add `"card"` to `asset-metadata-form.ts`'s `STRUCTURAL` set and the count/accessor guards; optionally teach `EnsureAssetSystemFields` to block-prepend missing system fields *after* a leading card marker instead of at absolute head. Until then the renderer's implicit-card degrade displays prepended system fields correctly.
