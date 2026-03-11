import { Hash } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface NumberSettings {
	min?: number;
	max?: number;
	step?: number;
	prepend?: string;
	append?: string;
}

export const numberPlugin: FieldTypePlugin<NumberSettings> = {
	id: "number",
	name: "Number",
	description: "A numeric value",
	icon: Hash,
	category: "number",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(field: Field<NumberSettings>) {
		let schema = z.number();
		const settings = field.settings ?? {};

		if (settings.min !== undefined) {
			schema = schema.min(settings.min);
		}

		if (settings.max !== undefined) {
			schema = schema.max(settings.max);
		}

		return schema;
	},

	defaultSettings: {},
	availableIn: ["blueprint", "task", "form"],
};
