import { Mail } from "lucide-react";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { EmailField } from "../../renderer/fields/email-field";
import { EmailCell } from "../../table/cells/email-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface EmailSettings {
	placeholder?: string;
}

export const emailPlugin: FieldTypePlugin<EmailSettings> = {
	id: "email",
	name: "Email",
	description: "An email address",
	icon: Mail,
	category: "text",

	fieldComponent: EmailField,
	cellComponent: EmailCell,

	toZodType(field: Field<EmailSettings>): ZodTypeAny {
		if (field.config.required) {
			return z.string().email(`${field.config.name} must be a valid email`);
		}

		// When optional, still validate format if a value is provided
		return z.string().email("Invalid email format").or(z.literal(""));
	},

	defaultSettings: { placeholder: "" },
	availableIn: ["blueprint", "task", "form"],
};
