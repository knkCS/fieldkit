import { Layers } from "lucide-react";
import { z } from "zod";
import { GroupField } from "../../renderer/fields/group-field";
import { GroupReadValue } from "../../renderer/fields/group-read";
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
	// The cell counts items because a table row has no height for more; read
	// mode has the page, so it shows them.
	readComponent: GroupReadValue,

	toZodType(field: Field<GroupSettings>, composeChildren) {
		const settings = field.settings ?? {};
		const children = field.children;

		// A row is the object its children describe, so a required field in row
		// 2 blocks submit and reports at `authors.1.name` — the very path the
		// renderer registers it under (ADR-0007). Unlike a Fieldset's, a
		// Group's children live in the Spec, so there is nothing to resolve
		// first; a Group that has none keeps the opaque row it always had.
		//
		// `passthrough`, because a stored row carries more than the Spec edits
		// — a backend id most obviously — and validating rows must not start
		// pruning them on submit.
		const row =
			composeChildren && children?.length
				? composeChildren(children).passthrough()
				: z.record(z.unknown());

		let schema = z.array(row);

		if (settings.min_items !== undefined) {
			schema = schema.min(settings.min_items);
		}

		if (settings.max_items !== undefined) {
			schema = schema.max(settings.max_items);
		}

		return schema;
	},

	defaultSettings: {},

	defaultValue: () => [],

	availableIn: ["blueprint", "task", "form"],
};
