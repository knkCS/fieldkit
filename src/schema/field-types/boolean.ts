import { ToggleLeft } from "lucide-react";
import { z } from "zod";
import { BooleanField } from "../../renderer/fields/boolean-field";
import { BooleanCell } from "../../table/cells/boolean-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export const booleanPlugin: FieldTypePlugin<null> = {
	id: "boolean",
	name: "Boolean",
	description: "A true/false toggle",
	icon: ToggleLeft,
	category: "boolean",

	fieldComponent: BooleanField,
	cellComponent: BooleanCell,

	toZodType(_field: Field<null>) {
		return z.boolean();
	},

	availableIn: ["blueprint", "task", "form"],
};
