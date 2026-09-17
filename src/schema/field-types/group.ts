import { Layers } from "lucide-react";
import { GroupField } from "../../renderer/fields/group-field";
import { GroupReadValue } from "../../renderer/fields/group-read";
import { GroupCell } from "../../table/cells/group-cell";
import type { FieldTypePlugin } from "../plugin";
import type { RowArrayCaps } from "../row-array";
import { rowArrayZodType } from "../row-array";
import type { Field } from "../types";

/** A Group's caps are the shared row-array pair, nothing more. */
export interface GroupSettings extends RowArrayCaps {}

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

	// A row array like a Virtual Table's, differing only in how a row is
	// edited — so the rule that validates one lives in `row-array.ts`.
	toZodType(field: Field<GroupSettings>, composeChildren) {
		return rowArrayZodType(field, composeChildren);
	},

	defaultSettings: {},

	defaultValue: () => [],

	availableIn: ["blueprint", "task", "form"],
};
