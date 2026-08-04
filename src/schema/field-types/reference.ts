import { Link2 } from "lucide-react";
import { z } from "zod";
import { ReferenceSettingsEditor } from "../../editor/field-settings/reference-settings";
import { ReferenceField } from "../../renderer/fields/reference-field";
import { ReferenceCell } from "../../table/cells/reference-cell";
import type { FieldTypePlugin } from "../plugin";
import { referenceTreeSchema } from "../reference";
import type { Field } from "../types";

export interface ReferenceSettings {
	/** The Blueprints this Field may point at. Empty or absent means the
	 * Adapter decides — fieldkit has no notion of a Blueprint kind
	 * (ADR-0002). */
	blueprints?: string[];
	/**
	 * At most this many References.
	 *
	 * A pure cap, never a change of shape: `max_items: 1` still stores a
	 * one-element array, because Single Reference is its own Field Type
	 * (ADR-0005). Declared, not yet enforced — the cap counts the *flattened*
	 * tree, so enforcing it belongs with the ticket that adds nesting rather
	 * than to a list that is still flat.
	 */
	max_items?: number;
	/** The deepest a Reference may sit, roots being zero. Declared on the same
	 * terms as `max_items` and enforced by the same later ticket; the tree
	 * itself nests as far as an Author drags it. */
	max_depth?: number;
}

/**
 * A Reference Tree: an ordered list of References, each of which may hold
 * References of its own.
 *
 * The Schema below is recursive because the value is (ADR-0008) — a nested
 * branch has to survive a parse, or a drop that nests on screen would submit
 * a flat list. Neither cap is enforced yet; both count the whole tree.
 */
export const referencePlugin: FieldTypePlugin<ReferenceSettings> = {
	id: "reference",
	name: "Reference",
	description: "Link to other content items",
	icon: Link2,
	category: "reference",

	settingsComponent: ReferenceSettingsEditor,
	fieldComponent: ReferenceField,
	cellComponent: ReferenceCell,

	toZodType(field: Field<ReferenceSettings>) {
		const schema = z.array(referenceTreeSchema);
		if (!field.config.required) return schema;
		return schema.min(1, `${field.config.name} is required`);
	},

	defaultSettings: { blueprints: [] },

	// A fresh array per call — an empty list is what the control renders, and
	// a shared one would be mutated across forms.
	defaultValue: () => [],

	availableIn: ["blueprint", "task", "form"],
};
