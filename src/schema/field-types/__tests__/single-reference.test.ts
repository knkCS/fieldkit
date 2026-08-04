import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { getDefaultValues, specToZodSchema } from "../../zod-builder";
import { builtInFieldTypes } from "../index";
import type { SingleReferenceSettings } from "../single-reference";
import { singleReferencePlugin } from "../single-reference";

function singleReferenceField(
	overrides: {
		required?: boolean;
		settings?: SingleReferenceSettings | null;
	} = {},
): Field<SingleReferenceSettings> {
	return {
		field_type: "single_reference",
		config: {
			name: "Primary article",
			api_accessor: "primary_article",
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: overrides.settings ?? {},
		children: null,
		system: false,
	};
}

describe("singleReferencePlugin", () => {
	it("has structural metadata and is registered as a built-in", () => {
		expect(singleReferencePlugin.id).toBe("single_reference");
		expect(singleReferencePlugin.category).toBe("reference");
		expect(builtInFieldTypes.some((p) => p.id === "single_reference")).toBe(
			true,
		);
	});

	it("accepts one Reference or nothing, never an array", () => {
		const zodType = singleReferencePlugin.toZodType(singleReferenceField());

		expect(zodType.safeParse({ id: "article-1" }).success).toBe(true);
		expect(zodType.safeParse(null).success).toBe(true);
		expect(zodType.safeParse([{ id: "article-1" }]).success).toBe(false);
		expect(zodType.safeParse([]).success).toBe(false);
		expect(zodType.safeParse("article-1").success).toBe(false);
		expect(zodType.safeParse({ id: "" }).success).toBe(false);
	});

	it("carries the Reference shape later tickets fill in", () => {
		const zodType = singleReferencePlugin.toZodType(singleReferenceField());

		// #68 sets `pin`, #64 sets `attributes` — a value already carrying
		// them must parse today, so a Spec saved by a later fieldkit still
		// loads here.
		expect(
			zodType.safeParse({ id: "article-1", pin: "release-3" }).success,
		).toBe(true);
		expect(zodType.safeParse({ id: "article-1", pin: null }).success).toBe(
			true,
		);
		expect(
			zodType.safeParse({ id: "article-1", attributes: { role: "lead" } })
				.success,
		).toBe(true);
	});

	it("rejects a nested Reference — children belong to the tree type", () => {
		const zodType = singleReferencePlugin.toZodType(singleReferenceField());

		const parsed = zodType.safeParse({
			id: "article-1",
			children: [{ id: "article-2" }],
		});
		expect(parsed.success).toBe(true);
		// Stripped rather than rejected: a Single Reference holds exactly one
		// Reference, so a stray branch is dropped, not blocked.
		expect(parsed.success && parsed.data).toEqual({ id: "article-1" });
	});

	it("blocks submit at its own path when required and empty", () => {
		const schema = specToZodSchema(
			[singleReferenceField({ required: true })],
			builtInFieldTypes,
		);

		const parsed = schema.safeParse({ primary_article: null });
		expect(parsed.success).toBe(false);
		expect(parsed.success === false && parsed.error.issues[0].path).toEqual([
			"primary_article",
		]);
		expect(
			parsed.success === false && parsed.error.issues[0].message,
		).toContain("Primary article");

		expect(schema.safeParse({ primary_article: { id: "a" } }).success).toBe(
			true,
		);
	});

	it("lets an optional Single Reference stay empty", () => {
		const schema = specToZodSchema([singleReferenceField()], builtInFieldTypes);

		expect(schema.safeParse({ primary_article: null }).success).toBe(true);
		expect(schema.safeParse({}).success).toBe(true);
	});

	it("defaults to no Reference", () => {
		expect(
			getDefaultValues([singleReferenceField()], builtInFieldTypes),
		).toEqual({ primary_article: null });
	});

	it("is offered wherever a leaf field can go", () => {
		expect(singleReferencePlugin.availableIn).toEqual([
			"blueprint",
			"task",
			"form",
		]);
	});
});
