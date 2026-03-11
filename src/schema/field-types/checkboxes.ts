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

	defaultSettings: { options: {} },
	availableIn: ["blueprint", "task", "form"],
};
