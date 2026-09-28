import { List } from "lucide-react";
import { z } from "zod";
import { ArrayField } from "../../renderer/fields/array-field";
import { ArrayCell } from "../../table/cells/array-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { arrayText } from "../value-text";

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

	fieldComponent: ArrayField,
	cellComponent: ArrayCell,

	toZodType(field: Field<ArraySettings>) {
		const settings = field.settings ?? {};

		if (settings.mode === "keyed") {
			return z.record(z.string());
		}

		// Default: dynamic mode — array of key-value objects. Either half may be
		// absent: a blank one is Unset, and Unset is stored as absent (ADR-0021),
		// so a pair saved with an empty value comes back without the key.
		return z.array(
			z.object({ key: z.string().optional(), value: z.string().optional() }),
		);
	},

	settingsSchema: z
		.object({
			mode: z.enum(["dynamic", "keyed"]).optional(),
			keys: z.array(z.string()).optional(),
		})
		.strict(),

	catalogue: { since: "0.18.0", hasText: true, pins: [] },
	text: arrayText,

	defaultSettings: { mode: "dynamic" },

	defaultValue: () => [],

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "reference_spec", "block_type"],
};
