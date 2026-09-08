import { SearchCheck } from "lucide-react";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { LookupSettingsEditor } from "../../editor/field-settings/lookup-settings";
import { LookupField } from "../../renderer/fields/lookup-field";
import { LookupCell } from "../../table/cells/lookup-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface LookupSettings {
	/**
	 * The Source this Field points into — the key it was registered under on
	 * `adapters.lookup`.
	 *
	 * An opaque string. Fieldkit never parses it, never enumerates the Sources
	 * and has no notion of what any of them hold (ADR-0002); the convention of
	 * writing it `service:collection` is the Consumer's, not fieldkit's.
	 *
	 * Absent or empty means the Field names no Source, which the control says
	 * rather than throwing.
	 */
	source?: string;
}

/**
 * Exactly one id from an external Source, or none.
 *
 * **Not a Reference.** A Reference points from the Content being edited to
 * another Content — something with a Blueprint, Versions and Releases, and
 * therefore something to pin to. A Lookup points at whatever a Consumer
 * registers a Source for: a layout stylesheet, a printer profile, a row in
 * another service's database. Fieldkit models none of that, so the value has
 * nothing to carry beyond the id (ADR-0015).
 *
 * **The value is a bare id string**, following `media` rather than
 * `single_reference`: a Reference stores an object because it carries a Pin and
 * Attributes, and a Lookup carries neither.
 *
 * **Single-only.** A list variant would produce `string[]` where this produces
 * `string`, and ADR-0005 is exactly about not hiding incompatible value shapes
 * behind one `field_type`. One can be minted later if something needs it.
 */
export const lookupPlugin: FieldTypePlugin<LookupSettings> = {
	id: "lookup",
	name: "Lookup",
	description: "Pick one item from an external source",
	icon: SearchCheck,
	// Picking one thing from a set, which is what `select` and `radio` are. It
	// is deliberately not `reference`: the picker groups by category, and a
	// Lookup sitting among the Reference types would say it is one.
	category: "selection",

	settingsComponent: LookupSettingsEditor,
	fieldComponent: LookupField,
	// No `readComponent`. Read mode could reach the Source and show a label
	// where the cell can only show an id — but that is a second async
	// implementation of what `LookupSelect` already does, which is the one thing
	// this type is not allowed to grow. Filed as a discovery rather than built.
	cellComponent: LookupCell,

	toZodType(field: Field<LookupSettings>): ZodTypeAny {
		const schema = z.string().nullable();
		if (!field.config.required) return schema;

		// `refine` over a schema that accepts every way of being empty, rather
		// than rejecting them in the type: the Field then reports its own name at
		// its own path, instead of Zod's "expected string, received null" for an
		// explicit `null` or a bare "Required" for a payload that omits the key.
		// The empty string is in that list because a cleared control is not a
		// chosen id.
		return schema.optional().refine((value) => value != null && value !== "", {
			message: `${field.config.name} is required`,
		});
	},

	// Empty, not a guess: only the Consumer knows what it registered, and a
	// Field pointed at a Source nobody registered is the one thing the control
	// has to say out loud.
	defaultSettings: { source: "" },

	// `null`, not `undefined`: "nothing picked" is a value the control renders
	// (an empty select), and a required Field must fail on it rather than on a
	// missing key.
	defaultValue: () => null,

	availableIn: ["blueprint", "task", "form", "attribute"],
};
