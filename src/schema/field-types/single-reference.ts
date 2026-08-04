import { Link } from "lucide-react";
import type { ZodTypeAny } from "zod";
import { SingleReferenceSettingsEditor } from "../../editor/field-settings/single-reference-settings";
import { SingleReferenceField } from "../../renderer/fields/single-reference-field";
import { SingleReferenceCell } from "../../table/cells/single-reference-cell";
import type { FieldTypePlugin } from "../plugin";
import { referenceValueSchema } from "../reference";
import type { Field } from "../types";

export interface SingleReferenceSettings {
	/** The Blueprints this Field may point at. Empty or absent means the
	 * Adapter decides — fieldkit has no notion of a Blueprint kind
	 * (ADR-0002). */
	blueprints?: string[];
}

/**
 * Exactly one Reference, or none.
 *
 * A separate Field Type rather than `reference` with `max_items: 1`, for the
 * reason ADR-0005 gives: incompatible value shapes must not hide behind one
 * `field_type`. The value here is a Reference or `null` — never an array.
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

	toZodType(field: Field<SingleReferenceSettings>): ZodTypeAny {
		const schema = referenceValueSchema.nullable();
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

	defaultSettings: { blueprints: [] },

	// `null`, not `undefined`: "no Reference" is a value the control renders
	// (an empty select), and a required Field must fail on it rather than on
	// a missing key.
	defaultValue: () => null,

	availableIn: ["blueprint", "task", "form"],
};
