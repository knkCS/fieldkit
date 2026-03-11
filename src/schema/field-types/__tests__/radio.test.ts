import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { RadioSettings } from "../radio";
import { radioPlugin } from "../radio";

describe("radioPlugin", () => {
	it("should have correct metadata", () => {
		expect(radioPlugin.id).toBe("radio");
		expect(radioPlugin.category).toBe("selection");
	});

	it("should generate required string Zod type", () => {
		const field: Field<RadioSettings> = {
			field_type: "radio",
			config: {
				name: "Priority",
				api_accessor: "priority",
				required: true,
				instructions: "",
			},
			settings: { options: { low: "Low", high: "High" } },
			children: null,
			system: false,
		};
		const zodType = radioPlugin.toZodType(field);
		expect(zodType.safeParse("low").success).toBe(true);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should generate optional string Zod type", () => {
		const field: Field<RadioSettings> = {
			field_type: "radio",
			config: {
				name: "Priority",
				api_accessor: "priority",
				required: false,
				instructions: "",
			},
			settings: { options: { low: "Low", high: "High" } },
			children: null,
			system: false,
		};
		const zodType = radioPlugin.toZodType(field);
		expect(zodType.safeParse("").success).toBe(true);
		expect(zodType.safeParse("low").success).toBe(true);
	});
});
