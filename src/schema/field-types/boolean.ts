import { ToggleLeft } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export const booleanPlugin: FieldTypePlugin = {
	id: "boolean",
	name: "Boolean",
	description: "A true/false toggle",
	icon: ToggleLeft,
	category: "boolean",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(_field: Field) {
		return z.boolean();
	},

	availableIn: ["blueprint", "task", "form"],
};
