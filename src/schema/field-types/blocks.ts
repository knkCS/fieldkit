import { Boxes } from "lucide-react";
import { z } from "zod";
import { BlocksField } from "../../renderer/fields/blocks-field";
import { BlocksCell } from "../../table/cells/blocks-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface BlockDefinition {
	type: string;
	name: string;
	fields: Field[];
}

export interface BlocksSettings {
	allowed_blocks: BlockDefinition[];
}

export const blocksPlugin: FieldTypePlugin<BlocksSettings> = {
	id: "blocks",
	name: "Blocks",
	description: "Dynamic content zones with different block types",
	icon: Boxes,
	category: "structural",

	fieldComponent: BlocksField,
	cellComponent: BlocksCell,

	toZodType(field: Field<BlocksSettings>) {
		const allowedBlocks = field.settings?.allowed_blocks ?? [];

		if (allowedBlocks.length === 0) {
			// No constraints — accept any block with a _type string
			return z.array(z.object({ _type: z.string() }).passthrough());
		}

		if (allowedBlocks.length === 1) {
			// Single block type — use literal match (discriminatedUnion needs 2+)
			return z.array(
				z.object({ _type: z.literal(allowedBlocks[0].type) }).passthrough(),
			);
		}

		// Multiple block types — use discriminatedUnion
		const blockSchemas = allowedBlocks.map((block) =>
			z.object({ _type: z.literal(block.type) }).passthrough(),
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
	availableIn: ["blueprint", "task", "form"],
};
