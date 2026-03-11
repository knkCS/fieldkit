import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { numberPlugin } from "../number";

describe("numberPlugin", () => {
	it("should have correct metadata", () => {
		expect(numberPlugin.id).toBe("number");
		expect(numberPlugin.category).toBe("number");
	});

	it("should generate number Zod type", () => {
		const field: Field = {
			field_type: "number",
			config: {
				name: "Age",
				api_accessor: "age",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = numberPlugin.toZodType(field);
		expect(zodType.safeParse(42).success).toBe(true);
		expect(zodType.safeParse("not a number").success).toBe(false);
	});

	it("should respect min setting", () => {
		const field: Field = {
			field_type: "number",
			config: {
				name: "Age",
				api_accessor: "age",
				required: false,
				instructions: "",
			},
			settings: { min: 0 },
			children: null,
			system: false,
		};
		const zodType = numberPlugin.toZodType(field);
		expect(zodType.safeParse(-1).success).toBe(false);
		expect(zodType.safeParse(0).success).toBe(true);
		expect(zodType.safeParse(10).success).toBe(true);
	});

	it("should respect max setting", () => {
		const field: Field = {
			field_type: "number",
			config: {
				name: "Score",
				api_accessor: "score",
				required: false,
				instructions: "",
			},
			settings: { max: 100 },
			children: null,
			system: false,
		};
		const zodType = numberPlugin.toZodType(field);
		expect(zodType.safeParse(50).success).toBe(true);
		expect(zodType.safeParse(100).success).toBe(true);
		expect(zodType.safeParse(101).success).toBe(false);
	});

	it("should respect both min and max settings", () => {
		const field: Field = {
			field_type: "number",
			config: {
				name: "Rating",
				api_accessor: "rating",
				required: false,
				instructions: "",
			},
			settings: { min: 1, max: 5 },
			children: null,
			system: false,
		};
		const zodType = numberPlugin.toZodType(field);
		expect(zodType.safeParse(0).success).toBe(false);
		expect(zodType.safeParse(3).success).toBe(true);
		expect(zodType.safeParse(6).success).toBe(false);
	});
});
