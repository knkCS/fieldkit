import { CircleDot } from "lucide-react";
import { z } from "zod";
import { RadioField } from "../../renderer/fields/radio-field";
import { RadioCell } from "../../table/cells/radio-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface RadioSettings {
	options: Record<string, string>;
}

export const radioPlugin: FieldTypePlugin<RadioSettings> = {
	id: "radio",
	name: "Radio",
	description: "A set of radio buttons for single selection",
	icon: CircleDot,
	category: "selection",

	fieldComponent: RadioField,
	cellComponent: RadioCell,

	toZodType(field: Field<RadioSettings>) {
		let schema = z.string();
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

	// No text: the value is an option key, an identifier, not prose.
	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	defaultSettings: { options: {} },
	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
