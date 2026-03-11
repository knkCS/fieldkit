import { Clock } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export const timePlugin: FieldTypePlugin = {
	id: "time",
	name: "Time",
	description: "A time value",
	icon: Clock,
	category: "date",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(field: Field) {
		let schema = z.string();

		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}

		return schema;
	},

	availableIn: ["blueprint", "task", "form"],
};
