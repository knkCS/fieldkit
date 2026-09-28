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

		expect(
			zodType.safeParse({ _id: "n-article-1", id: "article-1" }).success,
		).toBe(true);
		expect(zodType.safeParse(null).success).toBe(true);
		expect(
			zodType.safeParse([{ _id: "n-article-1", id: "article-1" }]).success,
		).toBe(false);
		expect(zodType.safeParse([]).success).toBe(false);
		expect(zodType.safeParse("article-1").success).toBe(false);
		expect(zodType.safeParse({ _id: "n-empty", id: "" }).success).toBe(false);
	});

	it("carries the Reference shape later tickets fill in", () => {
		const zodType = singleReferencePlugin.toZodType(singleReferenceField());

		// A Pin and the Reference Spec's values ride on the one node.
		expect(
			zodType.safeParse({
				_id: "n-article-1",
				id: "article-1",
				pin: "release-3",
			}).success,
		).toBe(true);
		expect(
			zodType.safeParse({
				_id: "n-article-1",
				id: "article-1",
				values: { role: "lead" },
			}).success,
		).toBe(true);
		// An Unset Pin is stored as absent (ADR-0021), never as `null`.
		expect(
			zodType.safeParse({ _id: "n-article-1", id: "article-1", pin: null })
				.success,
		).toBe(false);
	});

	it("requires an _id on its node", () => {
		const zodType = singleReferencePlugin.toZodType(singleReferenceField());

		expect(zodType.safeParse({ id: "article-1" }).success).toBe(false);
		expect(zodType.safeParse({ _id: "", id: "article-1" }).success).toBe(false);
		expect(
			zodType.safeParse({ _id: "x".repeat(65), id: "article-1" }).success,
		).toBe(false);
	});

	it("rejects a nested Reference — children belong to the tree type", () => {
		const zodType = singleReferencePlugin.toZodType(singleReferenceField());

		const parsed = zodType.safeParse({
			_id: "n-article-1",
			id: "article-1",
			children: [{ _id: "n-article-2", id: "article-2" }],
		});
		expect(parsed.success).toBe(true);
		// Stripped rather than rejected: a Single Reference holds exactly one
		// Reference, so a stray branch is dropped, not blocked.
		expect(parsed.success && parsed.data).toEqual({
			_id: "n-article-1",
			id: "article-1",
		});
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

		expect(
			schema.safeParse({ primary_article: { _id: "n-a", id: "a" } }).success,
		).toBe(true);
	});

	it("reports the same way when the key is missing altogether", () => {
		const schema = specToZodSchema(
			[singleReferenceField({ required: true })],
			builtInFieldTypes,
		);

		// A partial payload — a Consumer submitting only what changed — must
		// still get the Field's own message, not Zod's bare "Required".
		const parsed = schema.safeParse({});
		expect(parsed.success).toBe(false);
		expect(parsed.success === false && parsed.error.issues[0].path).toEqual([
			"primary_article",
		]);
		expect(parsed.success === false && parsed.error.issues[0].message).toBe(
			"Primary article is required",
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
		expect(singleReferencePlugin.consumers).toEqual([
			"blueprint",
			"task",
			"form",
		]);
		// One flat value a cell can show, so a Row Spec may hold it (ADR-0017);
		// never a Reference Spec, the recursion nothing would catch.
		expect(singleReferencePlugin.positions).toEqual([
			"root",
			"row",
			"block_type",
		]);
	});

	it("starts a new Field on the newest Version rather than pinning", () => {
		expect(singleReferencePlugin.defaultSettings).toEqual({
			blueprints: [],
			pin_mode: "none",
			spec: [],
		});
	});

	it("carries no always_latest, which pin_mode superseded", () => {
		expect(singleReferencePlugin.defaultSettings).not.toHaveProperty(
			"always_latest",
		);
	});
});

describe("singleReferencePlugin.mintIds — loading a stored value", () => {
	const load = (settings: SingleReferenceSettings, value: unknown) =>
		singleReferencePlugin.mintIds?.(singleReferenceField({ settings }), value, {
			fresh: false,
			mintChildren: (_children, record) => record,
		});

	it("brings a legacy node into the current shape", () => {
		expect(
			load(
				{ pin_mode: "none" },
				{
					id: "a",
					label: "Stale name",
					pin: "r-1",
					attributes: { role: "lead" },
				},
			),
		).toEqual({ _id: expect.any(String), id: "a", values: { role: "lead" } });
	});

	it("keeps a Pin when the Field pins Releases", () => {
		expect(
			load({ pin_mode: "release" }, { _id: "n-a", id: "a", pin: "r-1" }),
		).toEqual({ _id: "n-a", id: "a", pin: "r-1" });
	});

	it("returns a value already in shape by identity, and null as null", () => {
		const value = { _id: "n-a", id: "a", values: { role: "lead" } };

		expect(load({ pin_mode: "none" }, value)).toBe(value);
		expect(load({}, null)).toBeNull();
	});
});

describe("a Single Reference's linked Reference Spec", () => {
	const leaf = (field_type: string, name: string, accessor: string): Field => ({
		field_type,
		config: { name, api_accessor: accessor, required: true, instructions: "" },
		settings: null,
		children: null,
		system: false,
	});
	const compose = (children: Field[]) =>
		specToZodSchema(children, builtInFieldTypes);
	const zodType = singleReferencePlugin.toZodType(
		singleReferenceField({
			settings: {
				spec: [leaf("number", "Page", "page")],
				blueprints: [
					{
						blueprint: "person",
						spec_blueprint: "rel-1",
						spec: [leaf("text", "Role", "role")],
					},
				],
			},
		}),
		compose,
		{ targetBlueprint: (id) => (id === "ada" ? "person" : "article") },
	);

	it("replaces the embedded one for a target of its Blueprint", () => {
		expect(
			zodType.safeParse({ _id: "n-1", id: "ada", values: { role: "Author" } })
				.success,
		).toBe(true);
		const parsed = zodType.safeParse({
			_id: "n-1",
			id: "ada",
			values: { page: 3 },
		});
		expect(parsed.success).toBe(false);
		expect(!parsed.success && parsed.error.issues.map((i) => i.path)).toEqual([
			["values", "role"],
		]);
	});

	it("leaves the embedded one for a target of any other Blueprint", () => {
		expect(
			zodType.safeParse({ _id: "n-1", id: "post", values: { page: 3 } })
				.success,
		).toBe(true);
	});
});
