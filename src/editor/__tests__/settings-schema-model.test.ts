import { describe, expect, it } from "vitest";
import { z } from "zod";
import { textPlugin } from "../../schema/field-types/text";
import {
	describeSettingsSchema,
	humanizeSettingKey,
	writeSetting,
} from "../field-settings/settings-schema-model";

describe("describeSettingsSchema", () => {
	it("reads each declared key of a strict object, in declaration order", () => {
		const entries = describeSettingsSchema(
			z
				.object({
					placeholder: z.string().optional(),
					max_items: z.number().int().nonnegative().optional(),
					multiple: z.boolean().optional(),
				})
				.strict(),
		);

		expect(entries).toEqual([
			{ key: "placeholder", label: "Placeholder", shape: { kind: "string" } },
			{
				key: "max_items",
				label: "Max items",
				shape: { kind: "number", integer: true, min: 0 },
			},
			{ key: "multiple", label: "Multiple", shape: { kind: "boolean" } },
		]);
	});

	it("reads a built-in type's own settingsSchema", () => {
		const entries = describeSettingsSchema(
			textPlugin.settingsSchema as z.ZodTypeAny,
		);
		expect(entries?.map((e) => e.key)).toEqual([
			"placeholder",
			"prepend",
			"append",
		]);
	});

	it("reads enums, literal unions, lists of scalars and nested objects", () => {
		const entries = describeSettingsSchema(
			z.object({
				size: z.enum(["sm", "md", "lg"]).optional(),
				mode: z.union([z.literal("a"), z.literal("b")]).optional(),
				tags: z.array(z.string()).optional(),
				steps: z.array(z.number()).optional(),
				levels: z.array(z.enum(["h1", "h2"])).optional(),
				layout: z
					.object({ columns: z.number().max(4).optional() })
					.strict()
					.optional(),
			}),
		);

		expect(entries?.map((e) => e.shape)).toEqual([
			{ kind: "enum", options: ["sm", "md", "lg"] },
			{ kind: "enum", options: ["a", "b"] },
			{ kind: "list", item: { kind: "string" } },
			{ kind: "list", item: { kind: "number", integer: false } },
			{ kind: "list", item: { kind: "enum", options: ["h1", "h2"] } },
			{
				kind: "object",
				fields: [
					{
						key: "columns",
						label: "Columns",
						shape: { kind: "number", integer: false, max: 4 },
					},
				],
			},
		]);
	});

	it("degrades whatever a generic form cannot edit to a JSON view", () => {
		const entries = describeSettingsSchema(
			z.object({
				options: z.record(z.string()).optional(),
				blocks: z.array(z.object({ type: z.string() })).optional(),
				anything: z.unknown(),
			}),
		);
		expect(entries?.map((e) => e.shape.kind)).toEqual(["json", "json", "json"]);
	});

	it("sees through optional, nullable, default and refinements", () => {
		const entries = describeSettingsSchema(
			z
				.object({
					step: z.number().positive().nullable().optional(),
					on: z.boolean().default(true),
					name: z
						.string()
						.refine((s) => s.length < 10)
						.optional(),
				})
				.strict()
				.refine(() => true),
		);
		expect(entries?.map((e) => e.shape)).toEqual([
			// `positive` is exclusive, so no inclusive floor is offered.
			{ kind: "number", integer: false },
			{ kind: "boolean", defaultValue: true },
			{ kind: "string" },
		]);
	});

	it("carries a key's description as its helper text", () => {
		const entries = describeSettingsSchema(
			z.object({
				prefix: z.string().describe("Shown before the value").optional(),
			}),
		);
		expect(entries?.[0].description).toBe("Shown before the value");
	});

	it("answers null for a schema that is not an object", () => {
		expect(describeSettingsSchema(z.string())).toBeNull();
	});
});

describe("humanizeSettingKey", () => {
	it("turns snake_case and camelCase into a sentence-case label", () => {
		expect(humanizeSettingKey("max_items_per_page")).toBe("Max items per page");
		expect(humanizeSettingKey("allowBlank")).toBe("Allow blank");
	});
});

describe("writeSetting", () => {
	const entries = describeSettingsSchema(
		z
			.object({
				placeholder: z.string().optional(),
				max: z.number().optional(),
				layout: z
					.object({
						columns: z.number().optional(),
						dense: z.boolean().optional(),
					})
					.strict()
					.optional(),
			})
			.strict(),
	) as NonNullable<ReturnType<typeof describeSettingsSchema>>;

	it("sets the key and keeps the rest", () => {
		expect(writeSetting(entries, { max: 3 }, "placeholder", "Hi")).toEqual({
			max: 3,
			placeholder: "Hi",
		});
	});

	it("writes only the keys its schema declares", () => {
		expect(
			writeSetting(entries, { legacy: true, max: 3 }, "placeholder", "Hi"),
		).toEqual({ max: 3, placeholder: "Hi" });
	});

	it("keeps Unset out of what it writes (ADR-0021)", () => {
		expect(
			writeSetting(entries, { placeholder: "Hi", max: 3 }, "placeholder", ""),
		).toEqual({ max: 3 });
		expect(
			writeSetting(entries, { placeholder: "", max: null }, "max", undefined),
		).toEqual({});
		expect(
			writeSetting(entries, { layout: { columns: 2 } }, "layout", {
				columns: undefined,
			}),
		).toEqual({});
	});

	it("keeps 0 and false, which are values", () => {
		expect(writeSetting(entries, {}, "max", 0)).toEqual({ max: 0 });
		expect(writeSetting(entries, {}, "layout", { dense: false })).toEqual({
			layout: { dense: false },
		});
	});

	it("projects nested objects onto their declared keys too", () => {
		expect(
			writeSetting(entries, {}, "layout", { columns: 2, stray: "x" }),
		).toEqual({ layout: { columns: 2 } });
	});

	it("treats Unset settings as none", () => {
		expect(writeSetting(entries, null, "max", 5)).toEqual({ max: 5 });
	});
});
