import { Type as TypeIcon } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

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

	fieldComponent: () => null,
	cellComponent: undefined,

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

	defaultSettings: { placeholder: "" },
	availableIn: ["blueprint", "task", "form"],
};
