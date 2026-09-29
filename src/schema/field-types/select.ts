import { ChevronDown } from "lucide-react";
import { z } from "zod";
import { SelectField } from "../../renderer/fields/select-field";
import { SelectCell } from "../../table/cells/select-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { choiceText } from "../value-text";

export interface SelectSettings {
	options: Record<string, string>;
	multiple?: boolean;
}

export const selectPlugin: FieldTypePlugin<SelectSettings> = {
	id: "select",
	name: "Select",
	description: "A dropdown selection",
	icon: ChevronDown,
	category: "selection",

	fieldComponent: SelectField,
	cellComponent: SelectCell,

	toZodType(field: Field<SelectSettings>) {
		const settings = field.settings ?? { options: {} };

		if (settings.multiple) {
			let schema = z.array(z.string());
			if (field.config.required) {
				schema = schema.min(1, `${field.config.name} is required`);
			}
			return schema;
		}

		let schema = z.string();
		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}
		return schema;
	},

	settingsSchema: z
		.object({
			options: z.record(z.string()).optional(),
			multiple: z.boolean().optional(),
		})
		.strict(),

	// Its text is the selected keys' labels, never the keys (#223 D6).
	catalogue: { since: "0.18.0", hasText: true, pins: [] },
	text: choiceText,

	defaultSettings: { options: {} },

	defaultValue: (field: Field<SelectSettings>) =>
		field.settings?.multiple ? [] : "",

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
