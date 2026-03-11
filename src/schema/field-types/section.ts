import { LayoutDashboard } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export const sectionPlugin: FieldTypePlugin = {
	id: "section",
	name: "Section",
	description: "A structural section divider for organizing fields",
	icon: LayoutDashboard,
	category: "structural",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(_field: Field) {
		return z.never();
	},

	availableIn: ["blueprint", "task", "form"],
};
