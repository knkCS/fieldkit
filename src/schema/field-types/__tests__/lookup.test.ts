import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { LookupSettings } from "../lookup";
import { lookupPlugin } from "../lookup";

function makeField(
	overrides: { required?: boolean; settings?: LookupSettings | null } = {},
): Field<LookupSettings> {
	return {
		field_type: "lookup",
		config: {
			name: "Stylesheet",
			api_accessor: "stylesheet",
			required: overrides.required ?? false,
			instructions: "",
		},
		settings:
			overrides.settings === undefined
				? { source: "layout:stylesheet" }
				: overrides.settings,
		children: null,
		system: false,
	};
}

describe("lookupPlugin", () => {
	it("is a selection type, not a reference one", () => {
		expect(lookupPlugin.id).toBe("lookup");
		// A Lookup points outward at a Source, not at a Content, so it does not
		// belong beside the Reference types in the picker (ADR-0015).
		expect(lookupPlugin.category).toBe("selection");
	});

	it("validates a bare id string, or nothing", () => {
		const zodType = lookupPlugin.toZodType(makeField());

		expect(zodType.safeParse("sheet-1").success).toBe(true);
		expect(zodType.safeParse(null).success).toBe(true);
		// Never an object, and never an array: single-only, and a bare id.
		expect(zodType.safeParse({ id: "sheet-1" }).success).toBe(false);
		expect(zodType.safeParse(["sheet-1"]).success).toBe(false);
	});

	it("rejects both ways of being empty when required", () => {
		const zodType = lookupPlugin.toZodType(makeField({ required: true }));

		expect(zodType.safeParse("sheet-1").success).toBe(true);
		expect(zodType.safeParse(null).success).toBe(false);
		expect(zodType.safeParse(undefined).success).toBe(false);
		// An empty string is a cleared control, not a chosen id.
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("names the Field in the required message", () => {
		const zodType = lookupPlugin.toZodType(makeField({ required: true }));
		const result = zodType.safeParse(null);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.message).toBe("Stylesheet is required");
	});

	it("defaults a new Field's value to null, not undefined", () => {
		// `null`, not `undefined`: "nothing picked" is a value the control
		// renders (an empty select), and a required Field must fail on it rather
		// than on a missing key.
		expect(lookupPlugin.defaultValue?.(makeField())).toBeNull();
	});

	it("seeds no Source, so a new Field has to be pointed at one", () => {
		expect(lookupPlugin.defaultSettings).toEqual({ source: "" });
	});
});
