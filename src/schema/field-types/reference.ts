import { Link2 } from "lucide-react";
import { z } from "zod";
import { ReferenceSettingsEditor } from "../../editor/field-settings/reference-settings";
import { ReferenceField } from "../../renderer/fields/reference-field";
import { ReferenceCell } from "../../table/cells/reference-cell";
import type { FieldTypePlugin } from "../plugin";
import type { PinMode } from "../reference";
import { referenceTreeSchemaWith } from "../reference";
import { attributesZodType } from "../reference-attributes";
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
	/**
	 * Whether this Field fixes its References to a Release, to a Version, or
	 * tracks the newest Version.
	 *
	 * Absent reads as `"none"`, so a Spec authored before pinning existed keeps
	 * behaving as it did. What the Pin *points at* is settled here and nowhere
	 * else — the value stores a bare target id (ADR-0008) — which is why
	 * changing this invalidates every stored Pin at once instead of leaving
	 * some of them stale.
	 */
	pin_mode?: PinMode;
	/**
	 * The Attribute Spec: the Fields every Reference this Field holds carries
	 * about the pointing itself — the page a citation appears on, the role a
	 * credit names.
	 *
	 * Ordinary Fields, so "page" can be a number and "role" a select and either
	 * can be required, and the values are stored keyed by Accessor rather than
	 * positionally as knkCMS core does it.
	 *
	 * It lives here rather than in `children`, following the Blocks precedent —
	 * and it inherits ADR-0007's boundary verbatim. `src/schema/reference-
	 * attributes.ts` is where that boundary and what it costs are written down.
	 */
	attributes?: Field[];
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

	// The Attribute Spec is composed here rather than by the shared builder,
	// which is the whole of ADR-0007: a plugin reaches into its own settings and
	// nothing else does. Composing is not walking, so the boundary is unmoved —
	// no duplicate-Accessor check, no empty-name check and no Fieldset
	// resolution reaches an Attribute Field. See `../reference-attributes.ts`.
	toZodType(field: Field<ReferenceSettings>, composeChildren) {
		const schema = z.array(
			referenceTreeSchemaWith(
				attributesZodType(field.settings?.attributes, composeChildren),
			),
		);
		if (!field.config.required) return schema;
		return schema.min(1, `${field.config.name} is required`);
	},

	// A new Field tracks the newest Version: pinning is a deliberate choice an
	// Author makes, and it costs a second step every time a Reference is added.
	// It declares no Attributes either — a Reference that carries nothing about
	// the pointing is the ordinary case.
	defaultSettings: { blueprints: [], pin_mode: "none", attributes: [] },

	// A fresh array per call — an empty list is what the control renders, and
	// a shared one would be mutated across forms.
	defaultValue: () => [],

	availableIn: ["blueprint", "task", "form"],
};
