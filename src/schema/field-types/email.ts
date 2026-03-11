import { Mail } from "lucide-react";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
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

	fieldComponent: () => null,
	cellComponent: undefined,

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
