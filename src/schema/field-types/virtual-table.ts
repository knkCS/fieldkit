import { Table2 } from "lucide-react";
import { VirtualTableField } from "../../renderer/fields/virtual-table-field";
import { DEFAULT_MAX_RECORDS_PER_PAGE } from "../../renderer/fields/virtual-table-rows";
import { VirtualTableCell } from "../../table/cells/virtual-table-cell";
import type { FieldTypePlugin } from "../plugin";
import type { RowArrayCaps } from "../row-array";
import { rowArrayZodType } from "../row-array";
import type { Field } from "../types";

export interface VirtualTableSettings extends RowArrayCaps {
	/** Id of the Blueprint holding this Field's Row Spec — the **linked**
	 * half of ADR-0017, resolved through `adapters.blueprint.getSchema` as a
	 * Fieldset's is (ADR-0003), so several Virtual Table Fields can share one
	 * Row Spec. A Field that links a Blueprint must not also carry `children`;
	 * `validateSpec()` refuses both, and refuses neither. */
	blueprint?: string;
	always_latest?: boolean;
	max_records_per_page?: number;
}

export const virtualTablePlugin: FieldTypePlugin<VirtualTableSettings> = {
	id: "virtual_table",
	name: "Virtual Table",
	description: "A repeating table of rows, one per record",
	icon: Table2,
	category: "reference",

	fieldComponent: VirtualTableField,
	cellComponent: VirtualTableCell,

	/**
	 * An array of the row objects the resolved Row Spec describes — the row
	 * array rule a Group shares (`row-array.ts`), with the caps it offers.
	 *
	 * Whichever way the Row Spec was declared, it is `children` by the time it
	 * gets here: an embedded one is authored there, and `resolveSpec()` puts a
	 * linked one there (ADR-0004). A Field whose linked Row Spec was never
	 * resolved keeps the opaque row, on the Fieldset's reasoning.
	 */
	toZodType(field: Field<VirtualTableSettings>, composeChildren) {
		return rowArrayZodType(field, composeChildren);
	},

	// The same constant the renderer pages by, so a Field saved without the
	// setting and a Field saved with its default page identically.
	defaultSettings: { max_records_per_page: DEFAULT_MAX_RECORDS_PER_PAGE },

	defaultValue: () => [],

	// Every context (ADR-0017). A Consumer with no blueprint adapter still
	// gets the embedded Row Spec; only the linked one needs Blueprints.
	availableIn: ["blueprint", "task", "form"],
};
