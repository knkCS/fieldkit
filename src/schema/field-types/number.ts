import { Hash } from "lucide-react";
import { z } from "zod";
import { NumberField } from "../../renderer/fields/number-field";
import { NumberCell } from "../../table/cells/number-cell";
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

	fieldComponent: NumberField,
	cellComponent: NumberCell,

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

	settingsSchema: z
		.object({
			min: z.number().optional(),
			max: z.number().optional(),
			step: z.number().positive().optional(),
			prepend: z.string().optional(),
			append: z.string().optional(),
		})
		.strict(),

	catalogue: {
		since: "0.18.0",
		hasText: false,
		pins: [],
		validations: ["unique"],
	},

	defaultSettings: {},

	defaultValue: () => 0,

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
