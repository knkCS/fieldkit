import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { getDefaultValues, specToZodSchema } from "../../zod-builder";
import type { FieldsetSettings } from "../fieldset";
import { fieldsetPlugin } from "../fieldset";
import { builtInFieldTypes } from "../index";

function fieldsetField(
	overrides: { required?: boolean; settings?: FieldsetSettings | null } = {},
): Field<FieldsetSettings> {
	return {
		field_type: "fieldset",
		config: {
			name: "Address",
			api_accessor: "address",
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: overrides.settings ?? { blueprint: "address_bp" },
		children: null,
		system: false,
	};
}

describe("fieldsetPlugin", () => {
	it("has structural metadata and is registered as a built-in", () => {
		expect(fieldsetPlugin.id).toBe("fieldset");
		expect(fieldsetPlugin.category).toBe("structural");
		expect(builtInFieldTypes.some((p) => p.id === "fieldset")).toBe(true);
	});

	it("starts an inserted fieldset non-collapsible with no blueprint", () => {
		// The state an Author meets straight after inserting one — and the
		// state the renderer's "No blueprint selected" branch exists for.
		expect(fieldsetPlugin.defaultSettings).toEqual({ collapsible: false });
	});

	it("produces a value — it is not treated as a value-less marker", () => {
		// Section and Card are skipped by the zod builder and by
		// getDefaultValues. A Fieldset must appear in both: it holds one
		// record nested under its own accessor.
		const schema = specToZodSchema([fieldsetField()], builtInFieldTypes);
		expect(Object.keys(schema.shape)).toContain("address");
		expect(getDefaultValues([fieldsetField()], builtInFieldTypes)).toEqual({
			address: {},
		});
	});

	it("validates one record, not a list of them", () => {
		const zodType = fieldsetPlugin.toZodType(fieldsetField());
		expect(zodType.safeParse({ street: "12 Bridge Lane" }).success).toBe(true);
		expect(zodType.safeParse({}).success).toBe(true);
		expect(zodType.safeParse([{ street: "12 Bridge Lane" }]).success).toBe(
			false,
		);
		expect(zodType.safeParse("12 Bridge Lane").success).toBe(false);
		expect(zodType.safeParse(null).success).toBe(false);
	});

	it("asks only that the record be present when the field is required", () => {
		// Deliberately weak, and inert against a form seeded by
		// getDefaultValues — `{}` satisfies it. Required means something for a
		// Fieldset once its children join the schema (#53).
		const schema = specToZodSchema(
			[fieldsetField({ required: true })],
			builtInFieldTypes,
		);
		expect(schema.safeParse({}).success).toBe(false);
		expect(schema.safeParse({ address: {} }).success).toBe(true);
		expect(
			schema.safeParse({ address: { street: "12 Bridge Lane" } }).success,
		).toBe(true);
	});

	it("does not validate its children yet (#53)", () => {
		// The documented degrade path of #50: children render but are not
		// validated, because toZodType cannot yet recurse into them. Pinned so
		// the change lands deliberately rather than by accident.
		const withChildren: Field<FieldsetSettings> = {
			...fieldsetField(),
			children: [
				{
					field_type: "text",
					config: {
						name: "Street",
						api_accessor: "street",
						required: true,
						instructions: "",
					},
					settings: null,
					children: null,
					system: false,
				},
			],
		};
		const schema = specToZodSchema([withChildren], builtInFieldTypes);
		expect(schema.safeParse({ address: {} }).success).toBe(true);
	});

	it("seeds a fresh record per call", () => {
		const a = fieldsetPlugin.defaultValue?.(fieldsetField());
		const b = fieldsetPlugin.defaultValue?.(fieldsetField());
		expect(a).toEqual({});
		expect(a).not.toBe(b);
	});
});
