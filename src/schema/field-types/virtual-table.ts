import { Table2 } from "lucide-react";
import { z } from "zod";
import { VirtualTableSettingsEditor } from "../../editor/field-settings/virtual-table-settings";
import { VirtualTableField } from "../../renderer/fields/virtual-table-field";
import { DEFAULT_MAX_RECORDS_PER_PAGE } from "../../renderer/fields/virtual-table-rows";
import { VirtualTableCell } from "../../table/cells/virtual-table-cell";
import { BLUEPRINT_PIN } from "../blueprint-link";
import type { FieldTypePlugin } from "../plugin";
import type { RowArrayCaps } from "../row-array";
import {
	mintRowArrayIds,
	rowArrayCapsSchema,
	rowArrayZodType,
} from "../row-array";
import type { Field } from "../types";

export interface VirtualTableSettings extends RowArrayCaps {
	/** Id of the Blueprint holding this Field's Row Spec — the **linked**
	 * half of ADR-0017, resolved through `adapters.blueprint.getSchema` as a
	 * Fieldset's is (ADR-0003), so several Virtual Table Fields can share one
	 * Row Spec. A Field that links a Blueprint must not also carry `children`;
	 * `validateSpec()` refuses both, and refuses neither. */
	blueprint?: string;
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
	settingsComponent: VirtualTableSettingsEditor,

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

	// The caps a Group offers, plus the link and the paging. `fields`, the
	// inline row schema core's Go struct carried, is not a key: ADR-0017 put
	// an embedded Row Spec in `children`. Whether a Field declares its Row Spec
	// both ways or neither is a rule across settings and children, so
	// `validateSpec()` checks it, not this schema.
	settingsSchema: rowArrayCapsSchema
		.extend({
			blueprint: z.string().optional(),
			// The editor floors it at one row, as the renderer pages it.
			max_records_per_page: z.number().int().min(1).optional(),
		})
		.strict(),

	// A row's text is its Row Spec's Fields'; the table itself yields none.
	// A linked Row Spec's Blueprint is a Pin.
	catalogue: { since: "0.18.0", hasText: false, pins: [BLUEPRINT_PIN] },

	// The same constant the renderer pages by, so a Field saved without the
	// setting and a Field saved with its default page identically.
	defaultSettings: { max_records_per_page: DEFAULT_MAX_RECORDS_PER_PAGE },

	defaultValue: () => [],

	// Every row carries an `_id` (ADR-0023), minted here for loaded rows,
	// pasted and duplicated ones; its children mint their own.
	mintIds: mintRowArrayIds,

	// Every context (ADR-0017). A Consumer with no blueprint adapter still
	// gets the embedded Row Spec; only the linked one needs Blueprints.
	consumers: ["blueprint", "task", "form"],
	positions: ["root", "block_type"],
	// Its children are its Row Spec: flat value Fields only, which is the
	// `row` Position every type declares itself fit for or not (ADR-0017,
	// ADR-0022).
	childrenPosition: "row",
};
