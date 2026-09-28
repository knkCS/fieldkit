import { Mail } from "lucide-react";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { EmailField } from "../../renderer/fields/email-field";
import { EmailCell } from "../../table/cells/email-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { stringText } from "../value-text";

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
		return z.string().email(`${field.config.name} must be a valid email`);
	},

	settingsSchema: z
		.object({
			placeholder: z.string().optional(),
		})
		.strict(),

	catalogue: { since: "0.18.0", hasText: true, pins: [] },
	text: stringText,

	defaultSettings: { placeholder: "" },

	defaultValue: () => "",

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
