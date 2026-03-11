import { List } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface ArraySettings {
	mode?: "dynamic" | "keyed";
	keys?: string[];
}

export const arrayPlugin: FieldTypePlugin<ArraySettings> = {
	id: "array",
	name: "Array",
	description: "A list of key-value pairs or keyed values",
	icon: List,
	category: "structural",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(field: Field<ArraySettings>) {
		const settings = field.settings ?? {};

		if (settings.mode === "keyed") {
			return z.record(z.string());
		}

		// Default: dynamic mode — array of key-value objects
		return z.array(z.object({ key: z.string(), value: z.string() }));
	},

	defaultSettings: { mode: "dynamic" },
	availableIn: ["blueprint", "task", "form"],
};
