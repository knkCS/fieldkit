import { Boxes } from "lucide-react";
import { z } from "zod";
import { BlocksField } from "../../renderer/fields/blocks-field";
import { BlocksCell } from "../../table/cells/blocks-cell";
import type { ComposeChildrenSchema, FieldTypePlugin } from "../plugin";
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

	return declared.extend({ _type: z.literal(block.type) }).passthrough();
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
	// traversal draws: `resolveSpec()`, `validateSpec()` and
	// `resolveMarkerConvention()` still walk `Field.children` only, so only the
	// plugin that owns the settings reaches into them. What a Consumer meets,
	// spelled out in ADR-0007 and in blocks-field.mdx: a Fieldset declared
	// inside a block type is never resolved, and composes as the opaque record
	// any unresolved Fieldset does; and no check `validateSpec` runs reaches
	// these fields, so a duplicate Accessor between two of them goes unreported
	// with the later one silently winning the composed shape, as do an empty
	// name and an empty Accessor.
	toZodType(field: Field<BlocksSettings>, composeChildren) {
		const allowedBlocks = field.settings?.allowed_blocks ?? [];

		if (allowedBlocks.length === 0) {
			// No constraints — accept any block with a _type string
			return z.array(z.object({ _type: z.string() }).passthrough());
		}

		if (allowedBlocks.length === 1) {
			// Single block type — use literal match (discriminatedUnion needs 2+)
			return z.array(blockSchema(allowedBlocks[0], composeChildren));
		}

		// Multiple block types — use discriminatedUnion
		const blockSchemas = allowedBlocks.map((block) =>
			blockSchema(block, composeChildren),
		);
		return z.array(
			z.discriminatedUnion(
				"_type",
				blockSchemas as [
					(typeof blockSchemas)[0],
					(typeof blockSchemas)[1],
					...typeof blockSchemas,
				],
			),
		);
	},

	defaultSettings: { allowed_blocks: [] },

	defaultValue: () => [],

	availableIn: ["blueprint", "task", "form"],
};
