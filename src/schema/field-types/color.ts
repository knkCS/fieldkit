import { Palette } from "lucide-react";
import { z } from "zod";
import { ColorField } from "../../renderer/fields/color-field";
import { ColorCell } from "../../table/cells/color-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface ColorSettings {
	default_color?: string;
}

export const colorPlugin: FieldTypePlugin<ColorSettings> = {
	id: "color",
	name: "Color",
	description: "A color picker",
	icon: Palette,
	category: "text",

	fieldComponent: ColorField,
	cellComponent: ColorCell,

	toZodType(field: Field<ColorSettings>) {
		let schema = z.string();

		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}

		return schema;
	},

	defaultSettings: { default_color: "#000000" },
	availableIn: ["blueprint", "task", "form"],
};
