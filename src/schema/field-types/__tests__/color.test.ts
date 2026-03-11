import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { colorPlugin } from "../color";

describe("colorPlugin", () => {
	it("should have correct metadata", () => {
		expect(colorPlugin.id).toBe("color");
		expect(colorPlugin.category).toBe("text");
	});

	it("should generate required string Zod type", () => {
		const field: Field = {
			field_type: "color",
			config: {
				name: "Brand Color",
				api_accessor: "brand_color",
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = colorPlugin.toZodType(field);
		expect(zodType.safeParse("#ff0000").success).toBe(true);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should generate optional string Zod type", () => {
		const field: Field = {
			field_type: "color",
			config: {
				name: "Accent",
				api_accessor: "accent",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = colorPlugin.toZodType(field);
		expect(zodType.safeParse("").success).toBe(true);
		expect(zodType.safeParse("#00ff00").success).toBe(true);
	});
});
