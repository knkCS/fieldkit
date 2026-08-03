import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { getDefaultValues, specToZodSchema } from "../../zod-builder";
import { builtInFieldTypes } from "../index";
import type { ListSettings } from "../list";
import { listPlugin } from "../list";

function listField(
	overrides: { required?: boolean; settings?: ListSettings | null } = {},
): Field<ListSettings> {
	return {
		field_type: "list",
		config: {
			name: "Keywords",
			api_accessor: "keywords",
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: overrides.settings ?? {},
		children: null,
		system: false,
	};
}

describe("listPlugin", () => {
	it("has structural metadata and is registered as a built-in", () => {
		expect(listPlugin.id).toBe("list");
		expect(listPlugin.category).toBe("structural");
		expect(builtInFieldTypes.some((p) => p.id === "list")).toBe(true);
	});

	it("validates a flat array of strings", () => {
		const zodType = listPlugin.toZodType(listField());
		expect(zodType.safeParse(["alpha", "beta"]).success).toBe(true);
		expect(zodType.safeParse([]).success).toBe(true);
		expect(zodType.safeParse([{ key: "a", value: "b" }]).success).toBe(false);
		expect(zodType.safeParse({ a: "b" }).success).toBe(false);
		expect(zodType.safeParse("alpha").success).toBe(false);
	});

	it("rejects an empty list when the field is required", () => {
		const schema = specToZodSchema(
			[listField({ required: true })],
			builtInFieldTypes,
		);
		expect(schema.safeParse({ keywords: [] }).success).toBe(false);
		expect(schema.safeParse({}).success).toBe(false);
		expect(schema.safeParse({ keywords: ["alpha"] }).success).toBe(true);
	});

	it("rejects a required list holding only blank entries", () => {
		const schema = specToZodSchema(
			[listField({ required: true })],
			builtInFieldTypes,
		);
		// A list of blank entries reads as empty on screen — an entry cleared
		// to "" must not satisfy a required list.
		expect(schema.safeParse({ keywords: [""] }).success).toBe(false);
		expect(schema.safeParse({ keywords: ["alpha", ""] }).success).toBe(false);
	});

	it("tolerates a blank entry in an optional list", () => {
		const schema = specToZodSchema([listField()], builtInFieldTypes);
		expect(schema.safeParse({ keywords: [""] }).success).toBe(true);
	});

	it("accepts an absent or empty list when the field is optional", () => {
		const schema = specToZodSchema([listField()], builtInFieldTypes);
		expect(schema.safeParse({}).success).toBe(true);
		expect(schema.safeParse({ keywords: [] }).success).toBe(true);
		expect(schema.safeParse({ keywords: ["alpha"] }).success).toBe(true);
	});

	it("seeds an empty array as its default value", () => {
		expect(getDefaultValues([listField()], builtInFieldTypes)).toEqual({
			keywords: [],
		});
	});

	it("defaults to no pagination", () => {
		expect(listPlugin.defaultSettings).toEqual({ max_items_per_page: 0 });
	});

	it("is available in every field context", () => {
		expect(listPlugin.availableIn).toEqual(["blueprint", "task", "form"]);
	});
});
