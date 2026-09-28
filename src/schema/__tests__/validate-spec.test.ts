import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";

function mockPlugin(
	id: string,
	opts?: { maxPerSpec?: number },
): FieldTypePlugin {
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

describe("validateSpec", () => {
	it("should return valid for spec within constraints", () => {
		const plugins = new Map([["text", mockPlugin("text")]]);
		const fields = [mockField("text", "name"), mockField("text", "title")];
		const result = validateSpec(fields, plugins);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	// The two below stand in for a Consumer's plugin: `toc_reference` left
	// fieldkit's catalogue (ADR-0010) and took `maxPerSpec`'s only built-in
	// user with it. See `field-types/__tests__/create-reference-plugin.test.ts`
	// for the same rule against a plugin actually minted by a Consumer.
	it("should return error when maxPerSpec is exceeded", () => {
		const plugins = new Map([
			["toc_reference", mockPlugin("toc_reference", { maxPerSpec: 1 })],
		]);
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
		const plugins = new Map([
			["toc_reference", mockPlugin("toc_reference", { maxPerSpec: 1 })],
		]);
		const fields = [mockField("toc_reference", "toc1")];
		const result = validateSpec(fields, plugins);
		expect(result.valid).toBe(true);
	});
});

describe("validateSpec — accessor checks", () => {
	const plugins = new Map([
		["text", mockPlugin("text")],
		["group", mockPlugin("group")],
	]);

	function f(accessor: string, name = accessor): Field {
		return {
			field_type: "text",
			config: {
				name,
				api_accessor: accessor,
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
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
			path: "/a",
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

	function group(accessor: string, children: Field[]): Field {
		return {
			field_type: "group",
			config: {
				name: accessor,
				api_accessor: accessor,
				required: false,
				instructions: "",
			},
			settings: null,
			children,
			system: false,
		};
	}

	it("reports empty name for a group child (F5)", () => {
		const child = f("item_name", "");
		const result = validateSpec([group("items", [child])], plugins);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors).toContainEqual({
			accessor: "item_name",
			code: "empty_name",
			message: "Name must not be empty",
			path: "/items/children/item_name",
		});
	});

	it("reports duplicate_accessor for two children within the SAME group (F5)", () => {
		const result = validateSpec(
			[group("items", [f("dup"), f("dup")])],
			plugins,
		);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors).toContainEqual({
			accessor: "dup",
			code: "duplicate_accessor",
			message: 'Duplicate accessor "dup"',
			path: "/items/children/dup",
		});
	});

	it("does NOT flag the same accessor reused across DIFFERENT groups (namespaced, F5)", () => {
		const result = validateSpec(
			[group("group_a", [f("x")]), group("group_b", [f("x")])],
			plugins,
		);
		expect(result.valid).toBe(true);
		expect(
			result.fieldErrors.filter((e) => e.code === "duplicate_accessor"),
		).toEqual([]);
	});

	it("does NOT flag a child accessor colliding with a top-level accessor (namespaced, F5)", () => {
		const result = validateSpec([f("x"), group("items", [f("x")])], plugins);
		expect(result.valid).toBe(true);
		expect(
			result.fieldErrors.filter((e) => e.code === "duplicate_accessor"),
		).toEqual([]);
	});
});

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
			config: {
				name,
				api_accessor: accessor,
				required: false,
				instructions: "",
			},
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
			path: "/a",
		});
		expect(result.fieldErrors).toContainEqual({
			accessor: "b",
			code: "loose_field_in_carded_tab",
			message: 'Field "b" must be inside a card',
			path: "/b",
		});
		// The field AFTER the marker is inside the card — not flagged.
		expect(result.fieldErrors.filter((e) => e.accessor === "x")).toEqual([]);
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
		expect(result.fieldErrors.filter((e) => e.code === "empty_name")).toEqual(
			[],
		);
	});

	it("still enforces accessor rules on card markers", () => {
		const empty = card("");
		const result = validateSpec([empty, field("a")], plugins);
		expect(result.fieldErrors).toContainEqual({
			accessor: "",
			code: "empty_accessor",
			message: "Accessor must not be empty",
			path: "/",
		});

		const dup = validateSpec([card("dup"), field("dup")], plugins);
		expect(dup.fieldErrors.some((e) => e.code === "duplicate_accessor")).toBe(
			true,
		);
	});
});

// ADR-0018: a type's settings are what its `settingsSchema` declares. The
// shared conformance fixtures pin the answers against Go; these pin what only
// TS has — the full built-in map, where types without a schema still live.
describe("validateSpec — Field Types and settings", () => {
	const builtIns = new Map(builtInFieldTypes.map((p) => [p.id, p]));

	function field(type: string, accessor: string, settings?: unknown): Field {
		return { ...mockField(type, accessor), settings } as Field;
	}

	it("reports unknown_setting at the exact path, nested in a Group", () => {
		const group = {
			...field("group", "authors", { max_items: 2 }),
			children: [field("text", "name", { placehodler: "x" })],
		};
		const result = validateSpec([group], builtIns);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors).toEqual([
			expect.objectContaining({
				accessor: "name",
				code: "unknown_setting",
				path: "/authors/children/name/settings/placehodler",
			}),
		]);
	});

	it("reports invalid_setting and unknown_field_type", () => {
		const result = validateSpec(
			[field("number", "price", { step: 0 }), field("editor_schema", "x")],
			builtIns,
		);
		expect(
			result.fieldErrors.map(({ path, code, params }) => ({
				path,
				code,
				params,
			})),
		).toEqual([
			{ path: "/price/settings/step", code: "invalid_setting" },
			{
				path: "/x",
				code: "unknown_field_type",
				params: { field_type: "editor_schema" },
			},
		]);
	});

	it("leaves the settings of a type without a settingsSchema alone", () => {
		const result = validateSpec(
			[field("select", "colour", { anything: true, options: [] })],
			builtIns,
		);
		expect(result.fieldErrors).toEqual([]);
	});

	it("accepts every built-in type's defaultSettings", () => {
		const fields = builtInFieldTypes
			.filter((p) => p.settingsSchema)
			.map((p) => field(p.id, p.id, p.defaultSettings));
		// Settings errors only: a Virtual Table's defaults declare no Row Spec,
		// which is a rule across settings and children, not a bad default.
		const settingsErrors = validateSpec(fields, builtIns).fieldErrors.filter(
			(e) => e.code === "unknown_setting" || e.code === "invalid_setting",
		);
		expect(settingsErrors).toEqual([]);
	});
});

// A Block Type's Fields live in the Blocks Field's settings, and validateSpec
// walks them as it walks children (#208). The shared fixtures pin the rules Go
// has too; these pin the ones only TS checks so far.
describe("validateSpec — a Block Type's Fields", () => {
	const builtIns = new Map(builtInFieldTypes.map((p) => [p.id, p]));

	function blocks(allowed_blocks: unknown): Field {
		return { ...mockField("blocks", "content"), settings: { allowed_blocks } };
	}

	it("runs the accessor checks in each Block Type, its own namespace", () => {
		const result = validateSpec(
			[
				mockField("text", "title"),
				blocks([
					{
						type: "heading",
						name: "Heading",
						fields: [
							mockField("text", "title"),
							mockField("text", "title"),
							{
								...mockField("text", "subtitle"),
								config: { ...mockField("text", "subtitle").config, name: " " },
							},
						],
					},
					{
						type: "quote",
						name: "Quote",
						fields: [mockField("text", "title")],
					},
				]),
			],
			builtIns,
		);
		expect(
			result.fieldErrors.map(({ path, code }) => ({ path, code })),
		).toEqual([
			{
				path: "/content/settings/allowed_blocks/0/fields/subtitle",
				code: "empty_name",
			},
			{
				path: "/content/settings/allowed_blocks/0/fields/title",
				code: "duplicate_accessor",
			},
		]);
	});

	it("refuses a fields list that is not Fields, rather than walking half of it", () => {
		const result = validateSpec(
			[
				blocks([
					{ type: "a", name: "A", fields: [mockField("text", "ok"), "title"] },
					{ type: "b", name: "B", fields: [{ field_type: "text" }] },
				]),
			],
			builtIns,
		);
		expect(
			result.fieldErrors.map(({ path, code }) => ({ path, code })),
		).toEqual([
			{
				path: "/content/settings/allowed_blocks/0/fields",
				code: "invalid_setting",
			},
			{
				path: "/content/settings/allowed_blocks/1/fields",
				code: "invalid_setting",
			},
		]);
	});

	it("does not apply the card-layout rule inside a Block Type", () => {
		const result = validateSpec(
			[
				blocks([
					{
						type: "a",
						name: "A",
						fields: [mockField("text", "loose"), mockField("card", "c")],
					},
				]),
			],
			builtIns,
		);
		expect(result.fieldErrors).toEqual([]);
	});
});
