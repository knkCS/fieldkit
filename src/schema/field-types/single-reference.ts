import { Link } from "lucide-react";
import { type ZodTypeAny, z } from "zod";
import { SingleReferenceSettingsEditor } from "../../editor/field-settings/single-reference-settings";
import { SingleReferenceField } from "../../renderer/fields/single-reference-field";
import { SingleReferenceReadValue } from "../../renderer/fields/single-reference-read";
import { SingleReferenceCell } from "../../table/cells/single-reference-cell";
import type { FieldTypePlugin } from "../plugin";
import type { ReferenceSpecSettings } from "../reference";
import { referenceNodeSchema } from "../reference";
import {
	mintSingleReference,
	REFERENCE_SPEC_PIN,
	referenceHeldSpecs,
	referenceSettingsRules,
	referenceSpecSettingsShape,
	referenceValuesSchema,
	singleReferenceEdges,
	singleReferenceRecords,
} from "../reference-plugin";
import type { Field } from "../types";

/**
 * A Single Reference's settings: exactly what a Reference Field declares about
 * its References — `blueprints` with their optional linked Reference Spec, the
 * embedded Reference Spec, `pin_mode` — and meaning the same things; only the
 * control differs, and there are no caps.
 */
export type SingleReferenceSettings = ReferenceSpecSettings;

/**
 * Exactly one Reference, or none.
 *
 * A separate Field Type rather than `reference` with `max_items: 1`, for the
 * reason ADR-0005 gives: incompatible value shapes must not hide behind one
 * `field_type`. The value here is a Reference or `null` — never an array — and
 * its one node carries an `_id` as a tree's do (ADR-0023).
 */
export const singleReferencePlugin: FieldTypePlugin<SingleReferenceSettings> = {
	id: "single_reference",
	name: "Single Reference",
	description: "Link to exactly one content item",
	icon: Link,
	category: "reference",

	settingsComponent: SingleReferenceSettingsEditor,
	fieldComponent: SingleReferenceField,
	cellComponent: SingleReferenceCell,
	// The cell counts, because a cell cannot resolve a name; read mode reaches
	// the adapter and says which Content it is (ADR-0008).
	readComponent: SingleReferenceReadValue,

	toZodType(
		field: Field<SingleReferenceSettings>,
		composeChildren,
		context,
	): ZodTypeAny {
		const schema = referenceNodeSchema(
			referenceValuesSchema(field.settings, composeChildren, context),
		).nullable();
		if (!field.config.required) return schema;

		// `refine` over a schema that accepts both ways of being empty, rather
		// than rejecting them in the type: an empty Field then reports the
		// Field's own name at the Field's own path, instead of Zod's "expected
		// object, received null" for an explicit `null` or a bare "Required"
		// for a payload that omits the key altogether.
		return schema.optional().refine((value) => value != null, {
			message: `${field.config.name} is required`,
		});
	},

	// A new Field tracks the Release In Force, on the same terms as
	// `reference`: pinning is a deliberate choice, and it puts a second
	// control on screen.
	defaultSettings: { blueprints: [], pin_mode: "none", spec: [] },

	// The same settings a Reference Field declares about its References.
	settingsSchema: z.object(referenceSpecSettingsShape).strict(),

	// Its text is its values', read against its Reference Spec; a linked
	// Reference Spec is a Blueprint Pin, as a Reference Field's is.
	catalogue: { since: "0.18.0", hasText: false, pins: [REFERENCE_SPEC_PIN] },

	// `null`, not `undefined`: "no Reference" is a value the control renders
	// (an empty select), and a required Field must fail on it rather than on
	// a missing key.
	defaultValue: () => null,

	// Its node's `_id`, and a legacy node brought into the current shape.
	mintIds: mintSingleReference,

	// One `reference` edge, at the Field itself.
	edges: (_field, value) => singleReferenceEdges(value),

	// Its node's `values`, against its Reference Spec.
	records: singleReferenceRecords,

	heldSpecs: referenceHeldSpecs,
	settingsRules: referenceSettingsRules,

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "block_type"],
};
