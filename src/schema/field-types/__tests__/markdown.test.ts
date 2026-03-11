import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { MarkdownSettings } from "../markdown";
import { markdownPlugin } from "../markdown";

describe("markdownPlugin", () => {
	it("should have correct metadata", () => {
		expect(markdownPlugin.id).toBe("markdown");
		expect(markdownPlugin.category).toBe("text");
	});

	it("should generate required string Zod type", () => {
		const field: Field<MarkdownSettings> = {
			field_type: "markdown",
			config: {
				name: "Body",
				api_accessor: "body",
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = markdownPlugin.toZodType(field);
		expect(zodType.safeParse("# Hello").success).toBe(true);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should generate optional string Zod type", () => {
		const field: Field<MarkdownSettings> = {
			field_type: "markdown",
			config: {
				name: "Body",
				api_accessor: "body",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = markdownPlugin.toZodType(field);
		expect(zodType.safeParse("").success).toBe(true);
		expect(zodType.safeParse("# Hello").success).toBe(true);
	});

	it("should respect min/max length validation", () => {
		const field: Field<MarkdownSettings> = {
			field_type: "markdown",
			config: {
				name: "Body",
				api_accessor: "body",
				required: false,
				instructions: "",
			},
			validation: { min_length: 5, max_length: 100 },
			settings: null,
			children: null,
			system: false,
		};
		const zodType = markdownPlugin.toZodType(field);
		expect(zodType.safeParse("abc").success).toBe(false);
		expect(zodType.safeParse("abcde").success).toBe(true);
		expect(zodType.safeParse("a".repeat(101)).success).toBe(false);
	});
});
