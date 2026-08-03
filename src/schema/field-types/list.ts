import { ListOrdered } from "lucide-react";
import { z } from "zod";
import { ListSettingsEditor } from "../../editor/field-settings/list-settings";
import { ListField } from "../../renderer/fields/list-field";
import { ListCell } from "../../table/cells/list-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface ListSettings {
	/** Entries shown on one page. `0` (the default) paginates not at all.
	 * Key matches knkCMS core's `list` settings so seeded specs migrate
	 * without a rewrite (ADR-0005). */
	max_items_per_page?: number;
}

export const listPlugin: FieldTypePlugin<ListSettings> = {
	id: "list",
	name: "List",
	description: "A searchable, paginated list of free-text entries",
	icon: ListOrdered,
	category: "structural",

	fieldComponent: ListField,
	cellComponent: ListCell,
	settingsComponent: ListSettingsEditor,

	toZodType(field: Field<ListSettings>) {
		// A required list is a list with something *in* it: an empty array
		// passes a bare z.array(), and a list of blank entries reads as empty
		// to anyone looking at the form. Both are rejected here.
		//
		// An optional list keeps `z.string()` so stored data carrying a blank
		// entry still loads — the same "empty or valid" leniency the zod
		// builder applies to optional strings (#38).
		return field.config.required
			? z.array(z.string().min(1)).min(1)
			: z.array(z.string());
	},

	defaultSettings: { max_items_per_page: 0 },

	defaultValue: () => [],

	availableIn: ["blueprint", "task", "form"],
};
