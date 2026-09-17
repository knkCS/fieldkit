import { Table2 } from "lucide-react";
import { z } from "zod";
import { VirtualTableField } from "../../renderer/fields/virtual-table-field";
import { VirtualTableCell } from "../../table/cells/virtual-table-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface VirtualTableSettings {
	/** Id of the Blueprint holding this Field's Row Spec — the **linked**
	 * half of ADR-0017, resolved through `adapters.blueprint.getSchema` as a
	 * Fieldset's is (ADR-0003), so several Virtual Table Fields can share one
	 * Row Spec. A Field that links a Blueprint must not also carry `children`;
	 * `validateSpec()` refuses both, and refuses neither. */
	blueprint?: string;
	always_latest?: boolean;
	max_records_per_page?: number;
	/** Fewest rows the table accepts, as a Group's cap does. */
	min_items?: number;
	/** Most rows the table accepts. */
	max_items?: number;
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
	 * An array of the row objects the resolved Row Spec describes, composed
	 * exactly as a Group composes its children (ADR-0007) — so a wrong column
	 * type or a missing required column blocks submit and reports at
	 * `line_items.1.quantity`, the path the renderer registers.
	 *
	 * Whichever way the Row Spec was declared, it is `children` by the time it
	 * gets here: an embedded one is authored there, and `resolveSpec()` puts a
	 * linked one there (ADR-0004). A Field whose Row Spec was never resolved —
	 * a Consumer who skipped that step — keeps the opaque row it always had,
	 * on the same reasoning as a Fieldset: the Schema must not reject values
	 * for Fields fieldkit was never told about.
	 *
	 * `passthrough`, as a Group row gets it: a stored row carries more than
	 * the Row Spec edits — a backend id most obviously — and validating rows
	 * must not start pruning them on submit.
	 */
	toZodType(field: Field<VirtualTableSettings>, composeChildren) {
		const settings = field.settings ?? {};
		const children = field.children;

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

	defaultSettings: { max_records_per_page: 25 },

	defaultValue: () => [],

	// Every context (ADR-0017). A Consumer with no blueprint adapter still
	// gets the embedded Row Spec; only the linked one needs Blueprints.
	availableIn: ["blueprint", "task", "form"],
};
