import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Field } from "../../types";
import type { BlocksSettings } from "../blocks";
import { blocksPlugin } from "../blocks";

function createField(
	overrides: Partial<Field<BlocksSettings>> = {},
): Field<BlocksSettings> {
	return {
		field_type: "blocks",
		config: {
			name: "Content",
			api_accessor: "content",
			required: false,
			instructions: "",
		},
		settings: { allowed_blocks: [] },
		children: null,
		system: false,
		...overrides,
	};
}

describe("blocksPlugin", () => {
	it("should have correct metadata", () => {
		expect(blocksPlugin.id).toBe("blocks");
		expect(blocksPlugin.category).toBe("structural");
	});

	it("should generate array of objects with _type field", () => {
		const field: Field<BlocksSettings> = {
			field_type: "blocks",
			config: {
				name: "Content",
				api_accessor: "content",
				required: false,
				instructions: "",
			},
			settings: {
				allowed_blocks: [
					{ type: "hero", name: "Hero", fields: [] },
					{ type: "text", name: "Text Block", fields: [] },
				],
			},
			children: null,
			system: false,
		};
		const zodType = blocksPlugin.toZodType(field);
		expect(zodType.safeParse([]).success).toBe(true);
		expect(zodType.safeParse([{ _type: "hero", title: "Hello" }]).success).toBe(
			true,
		);
		expect(zodType.safeParse([{ _type: "text" }]).success).toBe(true);
		expect(zodType.safeParse("not an array").success).toBe(false);
	});

	it("should accept objects with _type and additional properties", () => {
		const field: Field<BlocksSettings> = {
			field_type: "blocks",
			config: {
				name: "Content",
				api_accessor: "content",
				required: false,
				instructions: "",
			},
			settings: { allowed_blocks: [] },
			children: null,
			system: false,
		};
		const zodType = blocksPlugin.toZodType(field);
		expect(
			zodType.safeParse([{ _type: "hero", heading: "test", image: "/img.png" }])
				.success,
		).toBe(true);
	});

	it("should validate _type against allowed_blocks when defined", () => {
		const field = createField({
			settings: {
				allowed_blocks: [
					{ type: "text", name: "Text", fields: [] },
					{ type: "image", name: "Image", fields: [] },
				],
			},
		});
		const zodType = blocksPlugin.toZodType(field);
		const schema = z.object({ blocks: zodType });

		// Valid block types
		expect(
			schema.safeParse({ blocks: [{ _type: "text" }, { _type: "image" }] })
				.success,
		).toBe(true);

		// Invalid block type
		expect(schema.safeParse({ blocks: [{ _type: "video" }] }).success).toBe(
			false,
		);
	});

	it("should handle single allowed_block without discriminatedUnion", () => {
		const field = createField({
			settings: {
				allowed_blocks: [{ type: "text", name: "Text", fields: [] }],
			},
		});
		const zodType = blocksPlugin.toZodType(field);
		const schema = z.object({ blocks: zodType });

		expect(schema.safeParse({ blocks: [{ _type: "text" }] }).success).toBe(
			true,
		);
		expect(schema.safeParse({ blocks: [{ _type: "video" }] }).success).toBe(
			false,
		);
	});
});
