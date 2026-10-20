import { CheckSquare } from "lucide-react";
import { z } from "zod";
import { ChoiceSettingsEditor } from "../../editor/field-settings/choice-settings";
import { CheckboxesField } from "../../renderer/fields/checkboxes-field";
import { CheckboxesCell } from "../../table/cells/checkboxes-cell";
import {
	type ChoiceOption,
	choiceOptionsRules,
	choiceOptionsSchema,
} from "../choice-options";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { choiceText } from "../value-text";

export interface CheckboxesSettings {
	/** The Options, in display order (ADR-0028). */
	options: ChoiceOption[];
}

export const checkboxesPlugin: FieldTypePlugin<CheckboxesSettings> = {
	id: "checkboxes",
	name: "Checkboxes",
	description: "A set of checkboxes for multiple selection",
	icon: CheckSquare,
	category: "selection",

	fieldComponent: CheckboxesField,
	settingsComponent: ChoiceSettingsEditor,
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
			options: choiceOptionsSchema.optional(),
		})
		.strict(),
	// A Key is unique within the Field (ADR-0028).
	settingsRules: choiceOptionsRules,

	// Its text is the selected keys' labels, never the keys (#223 D6).
	catalogue: { since: "0.18.0", hasText: true, pins: [] },
	text: choiceText,

	defaultSettings: { options: [] },

	defaultValue: () => [],

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
