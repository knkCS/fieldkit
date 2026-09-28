// The cases the shared fixtures cannot hold — a value beyond a cap is too big
// to freeze into a fixture — and the TS-only surface around validateValue.
// Everything both languages answer alike is in conformance/unreleased/.
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import type { Field } from "../types";
import { canonicalSpecSettings, canonicalValue } from "../unset";
import { VALUE_CAPS, validateValue } from "../validate-value";

function field(
	field_type: string,
	api_accessor: string,
	extra: Partial<Field> = {},
): Field {
	return {
		field_type,
		config: {
			name: api_accessor,
			api_accessor,
			required: false,
			instructions: "",
		},
		system: false,
		...extra,
	};
}

describe("validateValue caps", () => {
	it("reports a list beyond maxItems as too_many_items, and nothing inside it", () => {
		const items = Array.from({ length: VALUE_CAPS.maxItems + 1 }, () => 1);
		expect(
			validateValue(
				[field("checkboxes", "tags")],
				{ tags: items },
				builtInFieldTypes,
			),
		).toEqual([
			{
				path: "/tags",
				code: "too_many_items",
				params: { maximum: VALUE_CAPS.maxItems },
			},
		]);
	});

	it("accepts exactly maxItems", () => {
		const items = Array.from({ length: VALUE_CAPS.maxItems }, () => "a");
		expect(
			validateValue(
				[field("checkboxes", "tags")],
				{ tags: items },
				builtInFieldTypes,
			),
		).toEqual([]);
	});

	it("counts an object's keys against maxItems", () => {
		const entries = Object.fromEntries(
			Array.from({ length: VALUE_CAPS.maxItems + 1 }, (_, i) => [`k${i}`, "v"]),
		);
		expect(
			validateValue(
				[field("array", "keyed", { settings: { mode: "keyed" } })],
				{ keyed: entries },
				builtInFieldTypes,
			).map((e) => e.code),
		).toEqual(["too_many_items"]);
	});

	it("reports a string beyond maxStringBytes, counted in UTF-8 bytes, as too_large", () => {
		// 3 bytes each in UTF-8, one code unit in UTF-16: within the cap by
		// length, beyond it by bytes.
		const euros = "€".repeat(VALUE_CAPS.maxStringBytes / 3 + 1);
		expect(euros.length).toBeLessThan(VALUE_CAPS.maxStringBytes);
		expect(
			validateValue(
				[field("text", "title", { validation: { max_length: 1 } })],
				{ title: euros },
				builtInFieldTypes,
			),
		).toEqual([
			{
				path: "/title",
				code: "too_large",
				params: { maximum: VALUE_CAPS.maxStringBytes },
			},
		]);
	});

	it("accepts a string of exactly maxStringBytes", () => {
		expect(
			validateValue(
				[field("text", "title")],
				{ title: "a".repeat(VALUE_CAPS.maxStringBytes) },
				builtInFieldTypes,
			),
		).toEqual([]);
	});
});

describe("validateValue over the whole document", () => {
	it("caps keys the Spec does not name, and reports nothing else then", () => {
		const items = Array.from({ length: VALUE_CAPS.maxItems + 1 }, () => "");
		expect(
			validateValue(
				[
					field("text", "title", {
						config: { ...field("text", "title").config, required: true },
					}),
				],
				{ stray: items },
				builtInFieldTypes,
			).map((e) => `${e.path} ${e.code}`),
		).toEqual(["/stray too_many_items"]);
	});

	it("caps the number of keys at the root, at the empty path", () => {
		const data = Object.fromEntries(
			Array.from({ length: VALUE_CAPS.maxItems + 1 }, (_, i) => [`k${i}`, 1]),
		);
		expect(
			validateValue([], data, builtInFieldTypes).map((e) => e.code + e.path),
		).toEqual(["too_many_items"]);
	});

	it("checks everything but a validation.pattern that is no JS regular expression", () => {
		const spec = [
			field("text", "code", {
				validation: { pattern: "(", max_length: 2 },
			}),
		];
		expect(validateValue(spec, { code: "abc" }, builtInFieldTypes)).toEqual([
			{ path: "/code", code: "too_big" },
		]);
	});
});

describe("validateValue beyond the scalar types", () => {
	it("validates a Group's rows through its toZodType, a row's Unset required child as required", () => {
		const spec = [
			field("group", "authors", {
				children: [
					{
						...field("text", "name"),
						config: { ...field("text", "name").config, required: true },
					},
				],
			}),
		];
		expect(
			validateValue(
				spec,
				{ authors: [{ name: "Ada" }, { name: "" }, {}] },
				builtInFieldTypes,
			),
		).toEqual([
			{ path: "/authors/1/name", code: "not_canonical" },
			{ path: "/authors/1/name", code: "required" },
			{ path: "/authors/2/name", code: "required" },
		]);
	});

	it("skips a Field whose type is not among the plugins", () => {
		expect(
			validateValue([field("custom", "x")], { x: 5 }, builtInFieldTypes),
		).toEqual([]);
	});

	it("accepts the plugins as a map, as validateSpec does", () => {
		const map = new Map(builtInFieldTypes.map((p) => [p.id, p]));
		expect(validateValue([field("number", "n")], { n: "1" }, map)).toEqual([
			{ path: "/n", code: "invalid_type" },
		]);
	});
});

describe("canonicalValue", () => {
	it("strips Unset keys at every depth and keeps 0, false and array items", () => {
		expect(
			canonicalValue({
				title: "",
				count: 0,
				on: false,
				tags: [],
				nested: { a: null, b: { c: {} } },
				items: [null, "", { x: "" }],
			}),
		).toStrictEqual({ count: 0, on: false, items: [null, "", {}] });
	});

	it("is undefined for a value that is Unset as a whole", () => {
		expect(canonicalValue({ a: "", b: [] })).toBeUndefined();
		expect(canonicalValue(null)).toBeUndefined();
	});

	it("leaves objects that are not plain records alone", () => {
		const when = new Date(0);
		expect(canonicalValue({ when })).toStrictEqual({ when });
	});
});

describe("canonicalSpecSettings", () => {
	it("strips Unset settings, drops Unset settings whole, and recurses into children", () => {
		const spec = [
			field("text", "title", { settings: { placeholder: "", prepend: "x" } }),
			field("text", "bare", { settings: null }),
			field("group", "authors", {
				children: [field("text", "name", { settings: { append: null } })],
			}),
		];
		const canonical = canonicalSpecSettings(spec);
		expect(canonical[0].settings).toStrictEqual({ prepend: "x" });
		expect("settings" in canonical[1]).toBe(false);
		expect(canonical[2].children?.[0]).not.toHaveProperty("settings");
	});

	it("keeps the identity of a Spec that is canonical already", () => {
		const spec = [field("text", "title", { settings: { prepend: "x" } })];
		expect(canonicalSpecSettings(spec)).toBe(spec);
	});
});
