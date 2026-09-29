import { describe, expect, it } from "vitest";
import { edges, texts, valueText } from "../content-walk";
import { builtInFieldTypes } from "../field-types";
import type { ResolvedSpec } from "../resolve-spec";
import type { Field } from "../types";

const field = (
	field_type: string,
	api_accessor: string,
	extra: Partial<Field> = {},
): Field => ({
	field_type,
	config: { name: api_accessor, api_accessor, required: false },
	...extra,
});

const resolved = (fields: Field[]): ResolvedSpec => ({
	catalogue: "",
	vocabulary: "",
	fields,
	parts: {},
});

describe("text()", () => {
	it("is declared by exactly the types the Catalogue marks as having text", () => {
		for (const plugin of builtInFieldTypes) {
			if (!plugin.catalogue) continue;
			expect(Boolean(plugin.text), plugin.id).toBe(plugin.catalogue.hasText);
		}
	});

	it("reads a value through its type, and Unset or a wrong shape as none", () => {
		expect(valueText(field("text", "t"), "Hello", builtInFieldTypes)).toBe(
			"Hello",
		);
		expect(
			valueText(field("list", "l"), ["a", "", "b"], builtInFieldTypes),
		).toBe("a\nb");
		expect(
			valueText(
				field("array", "a", { settings: { mode: "keyed" } }),
				{ b: "2", a: "1" },
				builtInFieldTypes,
			),
		).toBe("a\n1\nb\n2");
		expect(valueText(field("text", "t"), "", builtInFieldTypes)).toBe("");
		expect(valueText(field("text", "t"), null, builtInFieldTypes)).toBe("");
		expect(valueText(field("text", "t"), 42, builtInFieldTypes)).toBe("");
	});
});

describe("a choice type's text", () => {
	const options = { settings: { options: { a: "Alpha", b: "Beta", c: "" } } };

	it("is the label of the selected key, never the key", () => {
		for (const type of ["select", "radio"]) {
			expect(valueText(field(type, "s", options), "a", builtInFieldTypes)).toBe(
				"Alpha",
			);
		}
	});

	it("is the labels of the selected keys in selection order, one per line", () => {
		expect(
			valueText(
				field("checkboxes", "c", options),
				["b", "a"],
				builtInFieldTypes,
			),
		).toBe("Beta\nAlpha");
		expect(
			valueText(
				field("select", "s", {
					settings: { ...options.settings, multiple: true },
				}),
				["b", "a"],
				builtInFieldTypes,
			),
		).toBe("Beta\nAlpha");
	});

	it("yields nothing for a key without a label", () => {
		expect(
			valueText(field("radio", "r", options), "zz", builtInFieldTypes),
		).toBe("");
		expect(
			valueText(field("radio", "r", options), "c", builtInFieldTypes),
		).toBe("");
		expect(
			valueText(field("radio", "r", options), "toString", builtInFieldTypes),
		).toBe("");
		expect(valueText(field("radio", "r"), "a", builtInFieldTypes)).toBe("");
		expect(
			valueText(
				field("checkboxes", "c", options),
				["zz", "c", "a", 1],
				builtInFieldTypes,
			),
		).toBe("Alpha");
	});

	it("yields nothing for a value not of the type's shape", () => {
		expect(
			valueText(field("select", "s", options), ["a"], builtInFieldTypes),
		).toBe("");
		expect(
			valueText(field("checkboxes", "c", options), "a", builtInFieldTypes),
		).toBe("");
	});
});

describe("edges() and texts()", () => {
	const spec = resolved([field("text", "title"), field("media", "hero")]);

	it("refuses data that is not an object, and reads nothing from none", () => {
		for (const data of [[], "x", null, 1]) {
			expect(() => edges(spec, data, builtInFieldTypes)).toThrow(TypeError);
			expect(() => texts(spec, data, builtInFieldTypes)).toThrow(TypeError);
		}
		expect(edges(spec, undefined, builtInFieldTypes)).toEqual([]);
		expect(texts(spec, {}, builtInFieldTypes)).toEqual([]);
	});

	it("never throws on values of the wrong shape", () => {
		const shapes = resolved([
			field("media", "m"),
			field("group", "g", { children: [field("text", "t")] }),
			field("blocks", "b", { settings: { allowed_blocks: "nope" } }),
			field("array", "a"),
		]);
		const data = {
			m: "x",
			g: { t: "y" },
			b: [1, { _type: "q" }],
			a: [1, { key: 2 }],
		};
		expect(edges(shapes, data, builtInFieldTypes)).toEqual([]);
		expect(texts(shapes, data, builtInFieldTypes)).toEqual([]);
	});

	it("reads only the plugins it is given", () => {
		expect(texts(spec, { title: "Hi" }, new Map())).toEqual([]);
	});
});
