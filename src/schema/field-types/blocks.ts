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

	toZodType(_field: Field<BlocksSettings>) {
		return z.array(z.object({ _type: z.string() }).passthrough());
	},

	defaultSettings: { allowed_blocks: [] },
	availableIn: ["blueprint", "task", "form"],
};
