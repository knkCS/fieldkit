import { FileText } from "lucide-react";
import { z } from "zod";
import { MarkdownField } from "../../renderer/fields/markdown-field";
import { MarkdownCell } from "../../table/cells/markdown-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface MarkdownSettings {
	placeholder?: string;
}

export const markdownPlugin: FieldTypePlugin<MarkdownSettings> = {
	id: "markdown",
	name: "Markdown",
	description: "Markdown-formatted text content",
	icon: FileText,
	category: "text",

	fieldComponent: MarkdownField,
	cellComponent: MarkdownCell,

	toZodType(field: Field<MarkdownSettings>) {
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

	defaultSettings: { placeholder: "" },
	availableIn: ["blueprint", "task", "form"],
};
