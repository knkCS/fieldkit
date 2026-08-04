import { Link2 } from "lucide-react";
import { z } from "zod";
import { ReferenceSettingsEditor } from "../../editor/field-settings/reference-settings";
import { ReferenceField } from "../../renderer/fields/reference-field";
import { ReferenceCell } from "../../table/cells/reference-cell";
import type { FieldTypePlugin } from "../plugin";
import { referenceValueSchema } from "../reference";
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
	 * (ADR-0005). Once the list nests, the cap counts the flattened tree.
	 */
	max_items?: number;
	/** Reserved for the nesting ticket, which is the first to enforce it. The
	 * list is flat here, so every Reference is at depth zero. */
	max_depth?: number;
}

/**
 * An ordered list of References.
 *
 * Flat in this ticket: `children` is part of the Reference shape (ADR-0008)
 * but nothing writes it yet, and the Schema below therefore describes a list
 * rather than a tree. Nesting extends the item schema with a lazily-recursive
 * `children`; nothing else about this plugin changes.
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
		const settings = field.settings ?? {};

		let schema = z.array(referenceValueSchema);

		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}

		// The Schema is the truth about the cap; the control additionally stops
		// offering to add at the limit. Note the blast radius: a Spec whose cap
		// was never enforced can begin blocking submit on data that saved
		// successfully before.
		if (settings.max_items !== undefined) {
			schema = schema.max(
				settings.max_items,
				`${field.config.name} allows at most ${String(settings.max_items)} references`,
			);
		}

		return schema;
	},

	defaultSettings: { blueprints: [] },

	// A fresh array per call — an empty list is what the control renders, and
	// a shared one would be mutated across forms.
	defaultValue: () => [],

	availableIn: ["blueprint", "task", "form"],
};
