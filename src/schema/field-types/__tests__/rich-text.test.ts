import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Field } from "../../types";
import type { RichTextSettings } from "../rich-text";
import { richTextPlugin } from "../rich-text";

const createField = (
	overrides: Partial<Field<RichTextSettings>["config"]> = {},
): Field<RichTextSettings> => ({
	field_type: "rich_text",
	config: {
		name: "Content",
		api_accessor: "content",
		required: false,
		instructions: "",
		...overrides,
	},
	settings: null,
	children: null,
	system: false,
});

describe("richTextPlugin", () => {
	it("should have correct metadata", () => {
		expect(richTextPlugin.id).toBe("rich_text");
		expect(richTextPlugin.category).toBe("text");
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
			settings: { text_type: "article@3", view_mode: "full" },
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

	it("should reject non-object values", () => {
		const field = createField({ required: true });
		const schema = z.object({ content: richTextPlugin.toZodType(field) });
		expect(schema.safeParse({ content: "plain string" }).success).toBe(false);
		expect(schema.safeParse({ content: 123 }).success).toBe(false);
		expect(schema.safeParse({ content: [1, 2] }).success).toBe(false);
	});

	it("should accept ProseMirror-like document objects", () => {
		const field = createField({ required: true });
		const schema = z.object({ content: richTextPlugin.toZodType(field) });
		expect(
			schema.safeParse({ content: { type: "doc", content: [] } }).success,
		).toBe(true);
	});

	it("pins a Text Type Release in text_type, and refuses the legacy editor_spec", () => {
		const schema = richTextPlugin.settingsSchema;
		expect(schema?.safeParse({ text_type: "article@3" }).success).toBe(true);
		expect(richTextPlugin.catalogue?.pins).toEqual([
			{ key: "text_type", kind: "text_type" },
		]);
		// A Spec still holding editor_spec is one to migrate: validateSpec
		// reports it as an unknown_setting (conformance/unreleased/validate-spec).
		expect(schema?.safeParse({ editor_spec: "default" }).success).toBe(false);
	});
});
