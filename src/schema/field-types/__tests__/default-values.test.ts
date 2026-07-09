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
		expect(
			select?.defaultValue?.(fieldOf("select", { multiple: true })),
		).toEqual([]);
	});

	it('reference is settings-dependent: max_items 1 → ""', () => {
		const reference = builtInFieldTypes.find((p) => p.id === "reference");
		expect(
			reference?.defaultValue?.(fieldOf("reference", { max_items: 1 })),
		).toBe("");
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
			expect(
				result.success,
				`${plugin.id} default must satisfy its own zod`,
			).toBe(true);
		}
	});
});
