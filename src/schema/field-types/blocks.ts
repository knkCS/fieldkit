import { Boxes } from "lucide-react";
import { z } from "zod";
import { BlocksField } from "../../renderer/fields/blocks-field";
import { BlocksCell } from "../../table/cells/blocks-cell";
import { blockTypeSpecs } from "../block-types";
import type { ComposeChildrenSchema, FieldTypePlugin } from "../plugin";
import { mintRowIds, RowZodArray, rowIdSchema } from "../row-ids";
import type { Field } from "../types";

export interface BlockDefinition {
	type: string;
	name: string;
	fields: Field[];
}

export interface BlocksSettings {
	allowed_blocks: BlockDefinition[];
}

/**
 * One branch of the union: the fields that block type declares, under the
 * `_type` that identifies it.
 *
 * `_id` rides beside it: every Block carries one (ADR-0023).
 *
 * `_type` is extended on last for the schema the way `BlocksField.addBlock`
 * writes it last for the value — the discriminator decides which fields
 * render, so a type declaring a field of that accessor must not be able to
 * overwrite it.
 *
 * `passthrough`, because a stored block carries keys its type doesn't declare
 * and validation arriving is no reason to prune them (ADR-0007). A type
 * declaring no fields therefore keeps exactly the opaque block it always had,
 * as does a Consumer calling `toZodType` with a Field alone.
 */
function blockSchema(
	block: BlockDefinition,
	composeChildren?: ComposeChildrenSchema,
) {
	const declared = composeChildren
		? composeChildren(block.fields ?? [])
		: z.object({});

	return declared
		.extend({ _id: rowIdSchema, _type: z.literal(block.type) })
		.passthrough();
}

export const blocksPlugin: FieldTypePlugin<BlocksSettings> = {
	id: "blocks",
	name: "Blocks",
	description: "Dynamic content zones with different block types",
	icon: Boxes,
	category: "structural",

	fieldComponent: BlocksField,
	cellComponent: BlocksCell,

	// Each allowed type validates what it declares, so a required field inside
	// a `heading` blocks submit and reports at `content.1.title` — the path
	// NestedItemFields registers it under, which is why nothing in the renderer
	// had to change (ADR-0007).
	//
	// A block type's fields live in `settings.allowed_blocks[].fields` rather
	// than in `children`, and composing them does not move the line shared
	// traversal draws: `resolveSpec()` and `resolveMarkerConvention()` still
	// walk `Field.children` only. What a Consumer meets, spelled out in
	// ADR-0007 and in blocks-field.mdx: a Fieldset declared inside a block type
	// is never resolved, and composes as the opaque record any unresolved
	// Fieldset does. `validateSpec()` does reach these fields since #208,
	// through `block-types.ts`, so a duplicate Accessor between two of them is
	// reported rather than silently winning the composed shape.
	toZodType(field: Field<BlocksSettings>, composeChildren) {
		const allowedBlocks = field.settings?.allowed_blocks ?? [];

		if (allowedBlocks.length === 0) {
			// No constraints — accept any block with a _type string
			return RowZodArray.of(
				z.array(
					z.object({ _id: rowIdSchema, _type: z.string() }).passthrough(),
				),
			);
		}

		if (allowedBlocks.length === 1) {
			// Single block type — use literal match (discriminatedUnion needs 2+)
			return RowZodArray.of(
				z.array(blockSchema(allowedBlocks[0], composeChildren)),
			);
		}

		// Multiple block types — use discriminatedUnion
		const blockSchemas = allowedBlocks.map((block) =>
			blockSchema(block, composeChildren),
		);
		return RowZodArray.of(
			z.array(
				z.discriminatedUnion(
					"_type",
					blockSchemas as [
						(typeof blockSchemas)[0],
						(typeof blockSchemas)[1],
						...typeof blockSchemas,
					],
				),
			),
		);
	},

	// Every Block carries an `_id` beside its `_type` (ADR-0023); a Block's
	// own Fields are its Block Type's.
	mintIds(field, value, context) {
		const allowedBlocks = field.settings?.allowed_blocks ?? [];
		return mintRowIds(
			value,
			context,
			(block) => allowedBlocks.find((b) => b.type === block._type)?.fields,
		);
	},

	// A Block Type needs its `type` — the `_type` a Block names it by — and a
	// name to be offered under, so those two are required inside each entry
	// (an Unset one is missing). Its `fields` are a Spec, and a Spec is not a
	// settings value: the schema only says they are a list, and
	// `validateSpec()` walks them as Fields, each against its own type, and
	// refuses Block Types sharing a `type` (`block-types.ts`).
	settingsSchema: z
		.object({
			allowed_blocks: z
				.array(
					z
						.object({
							type: z.string(),
							name: z.string(),
							fields: z.array(z.unknown()).optional(),
						})
						.strict(),
				)
				.optional(),
		})
		.strict(),

	// A Block's text is its Block Type's Fields'; the Field yields none of its
	// own.
	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	defaultSettings: { allowed_blocks: [] },

	defaultValue: () => [],

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "block_type"],
	// Each Block Type's Fields are a Spec in `block_type` Position, walked by
	// `validateSpec()` as `children` are (#208, ADR-0022).
	heldSpecs: (field) =>
		blockTypeSpecs(field).specs.map((spec) => ({
			segments: spec.segments,
			fields: spec.fields,
			position: "block_type" as const,
		})),
};
