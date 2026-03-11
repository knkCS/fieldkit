import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { RichTextSettings } from "../rich-text";
import { richTextPlugin } from "../rich-text";

describe("richTextPlugin", () => {
	it("should have correct metadata", () => {
		expect(richTextPlugin.id).toBe("rich_text");
		expect(richTextPlugin.category).toBe("text");
	});

	it("should generate z.any() Zod type", () => {
		const field: Field<RichTextSettings> = {
			field_type: "rich_text",
			config: {
				name: "Content",
				api_accessor: "content",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = richTextPlugin.toZodType(field);
		// z.any() accepts anything
		expect(zodType.safeParse("string content").success).toBe(true);
		expect(zodType.safeParse({ type: "doc", content: [] }).success).toBe(true);
		expect(zodType.safeParse(null).success).toBe(true);
		expect(zodType.safeParse(42).success).toBe(true);
	});

	it("should accept JSON document content", () => {
		const field: Field<RichTextSettings> = {
			field_type: "rich_text",
			config: {
				name: "Body",
				api_accessor: "body",
				required: true,
				instructions: "",
			},
			settings: { editor_spec: "default", view_mode: "full" },
			children: null,
			system: false,
		};
		const zodType = richTextPlugin.toZodType(field);
		const doc = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "Hello world" }],
				},
			],
		};
		expect(zodType.safeParse(doc).success).toBe(true);
	});

	it("should have default settings", () => {
		expect(richTextPlugin.defaultSettings).toEqual({ view_mode: "full" });
	});
});
