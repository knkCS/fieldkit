import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field } from "../../schema/types";
import { getDefaultValues } from "../../schema/zod-builder";
import { serializeDefaults } from "../editor-canvas";

describe("serializeDefaults — the canvas's reset guard", () => {
	it("is stable across calls although rows get fresh _ids (ADR-0023)", () => {
		const group: Field = {
			field_type: "group",
			config: {
				name: "Items",
				api_accessor: "items",
				required: false,
				instructions: "",
				default_value: [{ title: "x" }],
			},
			children: [],
			system: false,
		};
		const first = getDefaultValues([group], builtInFieldTypes);
		const second = getDefaultValues([group], builtInFieldTypes);
		expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
		expect(serializeDefaults(first)).toBe(serializeDefaults(second));
		expect(serializeDefaults(first)).toBe('{"items":[{"title":"x"}]}');
	});
});
