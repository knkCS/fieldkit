import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { textareaPlugin } from "../textarea";

describe("textareaPlugin", () => {
	it("should have correct metadata", () => {
		expect(textareaPlugin.id).toBe("textarea");
		expect(textareaPlugin.category).toBe("text");
	});

	it("should generate required string Zod type", () => {
		const field: Field = {
			field_type: "textarea",
			config: {
				name: "Description",
				api_accessor: "description",
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = textareaPlugin.toZodType(field);
		expect(zodType.safeParse("hello").success).toBe(true);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should generate optional string Zod type", () => {
		const field: Field = {
			field_type: "textarea",
			config: {
				name: "Notes",
				api_accessor: "notes",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = textareaPlugin.toZodType(field);
		expect(zodType.safeParse("").success).toBe(true);
	});

	it("should respect min/max length validation", () => {
		const field: Field = {
			field_type: "textarea",
			config: {
				name: "Bio",
				api_accessor: "bio",
				required: false,
				instructions: "",
			},
			validation: { min_length: 10, max_length: 500 },
			settings: null,
			children: null,
			system: false,
		};
		const zodType = textareaPlugin.toZodType(field);
		expect(zodType.safeParse("short").success).toBe(false);
		expect(zodType.safeParse("this is long enough").success).toBe(true);
	});
});
