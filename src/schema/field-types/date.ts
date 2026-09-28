import { Calendar } from "lucide-react";
import { z } from "zod";
import { DateField } from "../../renderer/fields/date-field";
import { DateCell } from "../../table/cells/date-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface DateSettings {
	enable_range?: boolean;
	min_date?: string;
	max_date?: string;
}

export const datePlugin: FieldTypePlugin<DateSettings> = {
	id: "date",
	name: "Date",
	description: "A date value",
	icon: Calendar,
	category: "date",

	fieldComponent: DateField,
	cellComponent: DateCell,

	toZodType(field: Field<DateSettings>) {
		let schema = z.string();

		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}

		return schema;
	},

	settingsSchema: z
		.object({
			enable_range: z.boolean().optional(),
			min_date: z.string().optional(),
			max_date: z.string().optional(),
		})
		.strict(),

	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	defaultSettings: { enable_range: false },
	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
