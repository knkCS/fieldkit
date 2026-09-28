import { LayoutDashboard } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

/** Settings for the section field type. Orientation is a whole-form
 * concern: SpecForm reads it from the first section only. */
export interface SectionSettings {
	orientation?: "horizontal" | "vertical";
}

export const sectionPlugin: FieldTypePlugin<SectionSettings> = {
	id: "section",
	name: "Section",
	description: "A structural section divider for organizing fields",
	icon: LayoutDashboard,
	category: "structural",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(_field: Field<SectionSettings>) {
		return z.never();
	},

	settingsSchema: z
		.object({
			orientation: z.enum(["horizontal", "vertical"]).optional(),
		})
		.strict(),

	// Markers are checked for their settings and nothing else: they hold no
	// value, so they yield no text.
	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	defaultSettings: {},
	availableIn: ["blueprint", "task", "form"],
};
