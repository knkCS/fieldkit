import { Clock } from "lucide-react";
import { z } from "zod";
import { TimeField } from "../../renderer/fields/time-field";
import { TimeCell } from "../../table/cells/time-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export const timePlugin: FieldTypePlugin = {
	id: "time",
	name: "Time",
	description: "A time value",
	icon: Clock,
	category: "date",

	fieldComponent: TimeField,
	cellComponent: TimeCell,

	toZodType(field: Field) {
		let schema = z.string();

		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}

		return schema;
	},

	availableIn: ["blueprint", "task", "form"],
};
