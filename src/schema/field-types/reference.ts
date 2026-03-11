import { Link2 } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface ReferenceSettings {
	blueprints?: string[];
	always_latest?: boolean;
	max_items?: number;
	max_depth?: number;
	attributes?: string[];
}

export const referencePlugin: FieldTypePlugin<ReferenceSettings> = {
	id: "reference",
	name: "Reference",
	description: "Link to other content items",
	icon: Link2,
	category: "reference",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(field: Field<ReferenceSettings>) {
		const settings = field.settings ?? {};

		if (settings.max_items === 1) {
			let schema = z.string();
			if (field.config.required) {
				schema = schema.min(1, `${field.config.name} is required`);
			}
			return schema;
		}

		let schema = z.array(z.string());
		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}
		return schema;
	},

	defaultSettings: { max_items: undefined },
	availableIn: ["blueprint", "task", "form"],
};
