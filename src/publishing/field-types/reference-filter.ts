import { ListX } from "lucide-react";
import { z } from "zod";
import { ListField } from "../../renderer/fields/list-field";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { ListCell } from "../../table/cells/list-cell";

/**
 * `reference_filter` has no settings yet. Its settings schema is an empty
 * strict object, so any key is `unknown_setting`; a setting added later is a
 * Catalogue that grows (ADR-0019).
 */
export type ReferenceFilterSettings = Record<string, never>;

/**
 * `reference_filter` — the Content ids a Reference leaves out: an exclusion
 * list, `string[]`, each id a non-blank string, in the order the author gave
 * them. Duplicates are allowed and mean nothing more than once.
 *
 * Its only Position is `reference_spec`: it describes one Reference, so it is
 * a Field of a Reference Spec and nowhere else (ADR-0022). It has no text —
 * ids are not prose — and yields no Content Graph edges.
 *
 * Its editing UI is the List's until the publishing types' UI is ported: one
 * id per entry. A Consumer attaches its own `fieldComponent` by spreading the
 * plugin (`{ ...referenceFilterPlugin, fieldComponent: Mine }`).
 */
export const referenceFilterPlugin: FieldTypePlugin<ReferenceFilterSettings> = {
	id: "reference_filter",
	name: "Reference filter",
	description: "The Content a Reference leaves out, by id",
	icon: ListX,
	category: "reference",

	fieldComponent:
		ListField as FieldTypePlugin<ReferenceFilterSettings>["fieldComponent"],
	cellComponent:
		ListCell as FieldTypePlugin<ReferenceFilterSettings>["cellComponent"],

	toZodType(field: Field<ReferenceFilterSettings>) {
		const schema = z.array(z.string().min(1));
		return field.config.required ? schema.min(1) : schema;
	},

	settingsSchema: z.object({}).strict(),

	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	defaultSettings: {},

	defaultValue: () => [],

	consumers: ["blueprint"],
	positions: ["reference_spec"],
};
