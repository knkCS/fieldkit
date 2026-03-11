import { Code } from "lucide-react";
import { z } from "zod";
import { CodeField } from "../../renderer/fields/code-field";
import { CodeCell } from "../../table/cells/code-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface CodeSettings {
	language?: string;
}

export const codePlugin: FieldTypePlugin<CodeSettings> = {
	id: "code",
	name: "Code",
	description: "Source code or preformatted text",
	icon: Code,
	category: "text",

	fieldComponent: CodeField,
	cellComponent: CodeCell,

	toZodType(field: Field<CodeSettings>) {
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

	defaultSettings: { language: undefined },
	availableIn: ["blueprint", "task", "form"],
};
