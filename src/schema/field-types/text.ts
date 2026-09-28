import { Type as TypeIcon } from "lucide-react";
import { z } from "zod";
import { TextField } from "../../renderer/fields/text-field";
import { TextCell } from "../../table/cells/text-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { stringText } from "../value-text";

export interface TextSettings {
	placeholder?: string;
	prepend?: string;
	append?: string;
}

export const textPlugin: FieldTypePlugin<TextSettings> = {
	id: "text",
	name: "Text",
	description: "A single line of text",
	icon: TypeIcon,
	category: "text",

	fieldComponent: TextField,
	cellComponent: TextCell,

	toZodType(field: Field<TextSettings>) {
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

		if (field.validation?.pattern) {
			schema = schema.regex(
				new RegExp(field.validation.pattern),
				field.validation.pattern_message ?? "Invalid format",
			);
		}

		return schema;
	},

	settingsSchema: z
		.object({
			placeholder: z.string().optional(),
			prepend: z.string().optional(),
			append: z.string().optional(),
		})
		.strict(),

	catalogue: { since: "0.18.0", hasText: true, pins: [] },
	text: stringText,

	defaultSettings: { placeholder: "" },

	defaultValue: () => "",

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
