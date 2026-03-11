import { AlignLeft } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

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

	fieldComponent: () => null,
	cellComponent: undefined,

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

	defaultSettings: { placeholder: "", rows: 4 },
	availableIn: ["blueprint", "task", "form"],
};
