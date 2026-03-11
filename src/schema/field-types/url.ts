import { Link } from "lucide-react";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { UrlField } from "../../renderer/fields/url-field";
import { UrlCell } from "../../table/cells/url-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface UrlSettings {
	placeholder?: string;
}

export const urlPlugin: FieldTypePlugin<UrlSettings> = {
	id: "url",
	name: "URL",
	description: "A web address",
	icon: Link,
	category: "text",

	fieldComponent: UrlField,
	cellComponent: UrlCell,

	toZodType(field: Field<UrlSettings>): ZodTypeAny {
		if (field.config.required) {
			return z.string().url(`${field.config.name} must be a valid URL`);
		}

		return z.string().url("Invalid URL format").or(z.literal(""));
	},

	defaultSettings: { placeholder: "" },
	availableIn: ["blueprint", "task", "form"],
};
