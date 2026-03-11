import { Layers } from "lucide-react";
import { z } from "zod";
import { GroupField } from "../../renderer/fields/group-field";
import { GroupCell } from "../../table/cells/group-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface GroupSettings {
	min_items?: number;
	max_items?: number;
}

export const groupPlugin: FieldTypePlugin<GroupSettings> = {
	id: "group",
	name: "Group",
	description: "A repeating group of fields",
	icon: Layers,
	category: "structural",

	fieldComponent: GroupField,
	cellComponent: GroupCell,

	toZodType(field: Field<GroupSettings>) {
		const settings = field.settings ?? {};
		let schema = z.array(z.record(z.unknown()));

		if (settings.min_items !== undefined) {
			schema = schema.min(settings.min_items);
		}

		if (settings.max_items !== undefined) {
			schema = schema.max(settings.max_items);
		}

		return schema;
	},

	defaultSettings: {},
	availableIn: ["blueprint", "task", "form"],
};
