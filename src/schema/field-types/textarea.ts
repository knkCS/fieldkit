import { AlignLeft } from "lucide-react";
import { z } from "zod";
import { TextareaField } from "../../renderer/fields/textarea-field";
import { TextareaCell } from "../../table/cells/textarea-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { stringText } from "../value-text";

export interface TextareaSettings {
	placeholder?: string;
	rows?: number;
}

export const textareaPlugin: FieldTypePlugin<TextareaSettings> = {
	id: "textarea",
	name: "Textarea",
	description: "Multiple lines of text",
	icon: AlignLeft,
	category: "text",

	fieldComponent: TextareaField,
	cellComponent: TextareaCell,

	toZodType(field: Field<TextareaSettings>) {
		let schema = z.string();

		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}

		if (field.validation?.min_length !== undefined) {
			schema = schema.min(field.validation.min_length);
		}

		if (field.validation?.max_length !== undefined) {
			schema = schema.max(field.validation.max_length);
		}

		return schema;
	},

	settingsSchema: z
		.object({
			placeholder: z.string().optional(),
			rows: z.number().int().positive().optional(),
		})
		.strict(),

	catalogue: { since: "0.18.0", hasText: true, pins: [] },
	text: stringText,

	defaultSettings: { placeholder: "", rows: 4 },

	defaultValue: () => "",

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
