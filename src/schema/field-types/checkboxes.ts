import { CheckSquare } from "lucide-react";
import { z } from "zod";
import { CheckboxesField } from "../../renderer/fields/checkboxes-field";
import { CheckboxesCell } from "../../table/cells/checkboxes-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface CheckboxesSettings {
	options: Record<string, string>;
}

export const checkboxesPlugin: FieldTypePlugin<CheckboxesSettings> = {
	id: "checkboxes",
	name: "Checkboxes",
	description: "A set of checkboxes for multiple selection",
	icon: CheckSquare,
	category: "selection",

	fieldComponent: CheckboxesField,
	cellComponent: CheckboxesCell,

	toZodType(field: Field<CheckboxesSettings>) {
		let schema = z.array(z.string());
		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}
		return schema;
	},

	settingsSchema: z
		.object({
			options: z.record(z.string()).optional(),
		})
		.strict(),

	// No text: the value is option keys, which are identifiers, not prose.
	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	defaultSettings: { options: {} },

	defaultValue: () => [],

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
