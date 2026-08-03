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
	// The record is opaque: `toZodType` receives only the Field and cannot
	// reach the plugins its children need, so a required child does not yet
	// block submit — and `config.required` on the Fieldset itself is inert in
	// practice, since the `{}` that `defaultValue` seeds already satisfies it.
	// That degrade is the documented seam of #50; #53 gives the plugin
	// contract a way to compose children and closes it.
	toZodType(_field: Field<FieldsetSettings>) {
		return z.record(z.unknown());
	},

	defaultSettings: { collapsible: false },

	defaultValue: () => ({}),

	availableIn: ["blueprint", "task", "form"],
};
