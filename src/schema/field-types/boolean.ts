import { ToggleLeft } from "lucide-react";
import { z } from "zod";
import { BooleanField } from "../../renderer/fields/boolean-field";
import { BooleanCell } from "../../table/cells/boolean-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export const booleanPlugin: FieldTypePlugin<null> = {
	id: "boolean",
	name: "Boolean",
	description: "A true/false toggle",
	icon: ToggleLeft,
	category: "boolean",

	fieldComponent: BooleanField,
	cellComponent: BooleanCell,

	toZodType(_field: Field<null>) {
		return z.boolean();
	},

	settingsSchema: z.object({}).strict(),

	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	defaultValue: () => false,

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
