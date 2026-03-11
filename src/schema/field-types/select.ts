import { ChevronDown } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

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

	fieldComponent: () => null,
	cellComponent: undefined,

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

	defaultSettings: { options: {} },
	availableIn: ["blueprint", "task", "form"],
};
