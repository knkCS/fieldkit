import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Field } from "../../types";
import { specToZodSchema } from "../../zod-builder";
import type { BlockDefinition, BlocksSettings } from "../blocks";
import { blocksPlugin } from "../blocks";
import { builtInFieldTypes } from "../index";

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

	describe("per-block-type validation", () => {
		/** One field as a block type declares it, in `allowed_blocks[].fields`. */
		const blockField = (accessor: string, required: boolean): Field => ({
			field_type: "text",
			config: {
				name: accessor,
				api_accessor: accessor,
				required,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		});

		const schema = (allowed_blocks: BlockDefinition[]) =>
			specToZodSchema(
				[createField({ settings: { allowed_blocks } })],
				builtInFieldTypes,
			);

		it("blocks submit on a required field in one block, and says which block", () => {
			const parsed = schema([
				{
					type: "heading",
					name: "Heading",
					fields: [blockField("title", true)],
				},
				{ type: "text", name: "Text", fields: [] },
			]).safeParse({
				content: [
					{ _type: "heading", title: "Chapter one" },
					{ _type: "heading", title: "" },
				],
			});

			expect(parsed.success).toBe(false);
			// The path NestedItemFields registers the block's field under.
			expect(parsed.error?.issues[0].path).toEqual(["content", 1, "title"]);
		});

		it("validates the sole block type's fields too", () => {
			// The literal branch, taken because discriminatedUnion needs 2+ —
			// it composes on the same terms as the union's branches.
			const sole = schema([
				{
					type: "heading",
					name: "Heading",
					fields: [blockField("title", true)],
				},
			]);

			expect(
				sole.safeParse({ content: [{ _type: "heading", title: "" }] }).success,
			).toBe(false);
			expect(
				sole.safeParse({
					content: [{ _type: "heading", title: "Chapter one" }],
				}).success,
			).toBe(true);
		});

		it("only asks of a block what its own type declares", () => {
			// The required `title` belongs to `heading`; a `text` block is not
			// missing it.
			const parsed = schema([
				{
					type: "heading",
					name: "Heading",
					fields: [blockField("title", true)],
				},
				{ type: "text", name: "Text", fields: [blockField("body", false)] },
			]).safeParse({ content: [{ _type: "text" }] });

			expect(parsed.success).toBe(true);
		});

		it("lets an optional field in a block stay empty", () => {
			expect(
				schema([
					{ type: "text", name: "Text", fields: [blockField("body", false)] },
					{ type: "rule", name: "Rule", fields: [] },
				]).safeParse({ content: [{ _type: "text", body: "" }] }).success,
			).toBe(true);
		});

		it("keeps keys the block type doesn't declare", () => {
			// A stored block carries more than the type edits — a backend id, most
			// obviously. Validation arriving is no reason to prune them (ADR-0007).
			const parsed = schema([
				{
					type: "heading",
					name: "Heading",
					fields: [blockField("title", false)],
				},
				{ type: "text", name: "Text", fields: [] },
			]).safeParse({
				content: [{ _type: "heading", title: "Chapter one", id: 7 }],
			});

			expect(parsed.data).toEqual({
				content: [{ _type: "heading", title: "Chapter one", id: 7 }],
			});
		});

		it("stays opaque where no types are allowed at all", () => {
			// The branch that returns before any composing. Covered here through
			// the Schema path, not just through a bare toZodType call.
			expect(
				schema([]).safeParse({ content: [{ _type: "anything", body: 1 }] })
					.success,
			).toBe(true);
		});

		it("stays an opaque block where the type declares no fields", () => {
			expect(
				schema([
					{ type: "rule", name: "Rule", fields: [] },
					{ type: "text", name: "Text", fields: [] },
				]).safeParse({ content: [{ _type: "rule", anything: 1 }] }).success,
			).toBe(true);
		});

		it("keeps _type the discriminator against a field declaring that accessor", () => {
			// `BlocksField.addBlock` writes `_type` last for the same reason: it
			// decides which fields render, so a declared field must not be able to
			// overwrite it — in the value or in the shape.
			const declared = schema([
				{
					type: "heading",
					name: "Heading",
					fields: [blockField("_type", false)],
				},
				{ type: "text", name: "Text", fields: [] },
			]);

			expect(
				declared.safeParse({ content: [{ _type: "heading" }] }).success,
			).toBe(true);
			expect(
				declared.safeParse({ content: [{ _type: "other" }] }).success,
			).toBe(false);
		});

		it("stays opaque when called without a composer", () => {
			// `toZodType` is public API and a Consumer may call it with a Field
			// alone (plugin.ts). Without the composer there is nothing to compose
			// with, so the block keeps the passthrough record it always had.
			const zodType = blocksPlugin.toZodType(
				createField({
					settings: {
						allowed_blocks: [
							{
								type: "heading",
								name: "Heading",
								fields: [blockField("title", true)],
							},
							{ type: "text", name: "Text", fields: [] },
						],
					},
				}),
			);

			expect(zodType.safeParse([{ _type: "heading" }]).success).toBe(true);
		});
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
