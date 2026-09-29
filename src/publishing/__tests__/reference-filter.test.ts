import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { edges, texts } from "../../schema/content-walk";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { validateSpec } from "../../schema/validate-spec";
import { validateValue } from "../../schema/validate-value";
import {
	EXCLUDE_EDGE_KIND,
	publishingFieldTypes,
	referenceFilterEdges,
	referenceFilterPlugin,
} from "..";

function filter(accessor: string, required = false): Field {
	return {
		field_type: "reference_filter",
		config: {
			name: accessor,
			api_accessor: accessor,
			required,
			instructions: "",
		},
		system: false,
	} as Field;
}

function reference(accessor: string, spec: Field[]): Field {
	return {
		field_type: "reference",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: { spec },
		system: false,
	} as Field;
}

function plugins(list: FieldTypePlugin[]): Map<string, FieldTypePlugin> {
	return new Map(list.map((p) => [p.id, p]));
}

const core = plugins(builtInFieldTypes);
const optedIn = plugins([...builtInFieldTypes, ...publishingFieldTypes]);

function codes(errors: { path: string; code: string }[]) {
	return errors.map(({ path, code }) => ({ path, code }));
}

describe("the publishing package", () => {
	it("is nothing the built-in types include", () => {
		for (const plugin of publishingFieldTypes) {
			expect(builtInFieldTypes.map((p) => p.id)).not.toContain(plugin.id);
		}
	});

	it("leaves its types unknown until a Consumer opts in", () => {
		const spec = [reference("related", [filter("exclude")])];
		expect(codes(validateSpec(spec, core).fieldErrors)).toEqual([
			{ path: "/related/settings/spec/exclude", code: "unknown_field_type" },
		]);
		expect(validateSpec(spec, optedIn).fieldErrors).toEqual([]);
	});

	it("matches the committed publishing Catalogue section", () => {
		const section = JSON.parse(
			readFileSync(
				path.resolve(__dirname, "../../../go/publishing/catalogue.json"),
				"utf8",
			),
		) as { types: { id: string }[] };
		expect(section.types.map((t) => t.id)).toEqual(
			publishingFieldTypes.map((p) => p.id).sort(),
		);
	});
});

describe("reference_filter", () => {
	it("sits only in a Reference Spec", () => {
		const spec = [
			reference("related", [filter("exclude")]),
			filter("root"),
			{
				field_type: "group",
				config: {
					name: "g",
					api_accessor: "g",
					required: false,
					instructions: "",
				},
				children: [filter("inner")],
				system: false,
			} as Field,
		];
		expect(codes(validateSpec(spec, optedIn).fieldErrors)).toEqual([
			{ path: "/root", code: "invalid_position" },
			{ path: "/g/children/inner", code: "invalid_position" },
		]);
	});

	it("has no settings", () => {
		const spec = [
			reference("related", [
				{ ...filter("exclude"), settings: { mode: "strict" } } as Field,
			]),
		];
		expect(codes(validateSpec(spec, optedIn).fieldErrors)).toEqual([
			{
				path: "/related/settings/spec/exclude/settings/mode",
				code: "unknown_setting",
			},
		]);
	});

	it("holds a list of Content ids, none blank", () => {
		const schema = referenceFilterPlugin.toZodType(filter("exclude"));
		expect(schema.safeParse(["c1", "c2", "c1"]).success).toBe(true);
		expect(schema.safeParse([]).success).toBe(true);
		expect(schema.safeParse(["c1", ""]).success).toBe(false);
		expect(schema.safeParse([1]).success).toBe(false);
		expect(schema.safeParse("c1").success).toBe(false);
		const required = referenceFilterPlugin.toZodType(filter("exclude", true));
		expect(required.safeParse([]).success).toBe(false);
	});

	it("is checked in a Reference's values", () => {
		const spec = [reference("related", [filter("exclude")])];
		const data = {
			related: [{ _id: "n1", id: "c1", values: { exclude: ["c2", ""] } }],
		};
		expect(codes(validateValue(spec, data, optedIn))).toEqual([
			{ path: "/related/n1/values/exclude/1", code: "too_small" },
		]);
		// Without the package the value is not checked: its type is unknown.
		expect(validateValue(spec, data, core)).toEqual([]);
	});

	it("yields one exclude edge per distinct id, at the Field, with no Pin", () => {
		const resolved = {
			catalogue: "",
			vocabulary: "",
			fields: [reference("related", [filter("exclude")])],
			parts: {},
		};
		const data = {
			related: [
				{
					_id: "n1",
					id: "c1",
					values: { exclude: ["c2", "c3", "c2", ""] },
				},
			],
		};
		expect(edges(resolved, data, optedIn)).toEqual([
			{ path: "/related/n1", kind: "reference", target: { content: "c1" } },
			{
				path: "/related/n1/values/exclude",
				kind: EXCLUDE_EDGE_KIND,
				target: { content: "c2" },
			},
			{
				path: "/related/n1/values/exclude",
				kind: EXCLUDE_EDGE_KIND,
				target: { content: "c3" },
			},
		]);
		expect(EXCLUDE_EDGE_KIND).toBe("exclude");
		expect(referenceFilterEdges("c2")).toEqual([]);
		expect(texts(resolved, data, optedIn)).toEqual([]);
	});
});
