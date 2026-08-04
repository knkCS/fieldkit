import { Frame } from "lucide-react";
import { z } from "zod";
import { FieldsetSettingsEditor } from "../../editor/field-settings/fieldset-settings";
import { FieldsetField } from "../../renderer/fields/fieldset-field";
import { FieldsetCell } from "../../table/cells/fieldset-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface FieldsetSettings {
	/** Id of the Blueprint whose Fields this Fieldset embeds. Resolved
	 * through `adapters.blueprint.getSchema` — a Fieldset never stores its
	 * children in the spec (ADR-0003). Keys match knkCMS core's `fieldset`
	 * settings so seeded specs migrate without a rewrite. */
	blueprint?: string;
	/** Whether a form user can fold the embedded Fields away. */
	collapsible?: boolean;
}

export const fieldsetPlugin: FieldTypePlugin<FieldsetSettings> = {
	id: "fieldset",
	name: "Fieldset",
	description: "Embeds another blueprint's fields as one record",
	icon: Frame,
	category: "structural",

	fieldComponent: FieldsetField,
	cellComponent: FieldsetCell,
	settingsComponent: FieldsetSettingsEditor,

	// A Fieldset holds ONE record, so its value is an object — this is what
	// keeps it out of the value-less Marker skip-list a Card sits in.
	//
	// Resolved, that record is the object its children describe, so a required
	// child blocks submit and reports at its own path (#53). Unresolved, it
	// stays the opaque record of #50: children are what "resolved" means
	// (ADR-0003), and a Consumer who skipped `resolveSpec()` gets Fields the
	// renderer self-resolves for display but the Schema never saw. Rejecting
	// their values on that path would fail a form over a Field fieldkit was
	// never told about.
	//
	// `passthrough`, on the same reasoning a Group row gets it: the embedded
	// record is stored with keys the Blueprint doesn't edit, and validating it
	// must not start pruning them on submit.
	toZodType(field: Field<FieldsetSettings>, composeChildren) {
		const children = field.children;
		if (!composeChildren || children == null) return z.record(z.unknown());
		return composeChildren(children).passthrough();
	},

	defaultSettings: { collapsible: false },

	// The children's own defaults, so a Fieldset seeds the record its Fields
	// expect rather than an empty one they then have to fill (#53) — and `{}`
	// still, unresolved or composed from children that seed nothing.
	defaultValue: (field, composeChildren) => {
		const children = field.children;
		if (!composeChildren || children == null) return {};
		return composeChildren(children);
	},

	availableIn: ["blueprint", "task", "form"],
};
