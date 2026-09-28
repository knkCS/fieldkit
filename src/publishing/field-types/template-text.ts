import { Braces } from "lucide-react";
import { z } from "zod";
import { TextareaField } from "../../renderer/fields/textarea-field";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { TextareaCell } from "../../table/cells/textarea-cell";

/**
 * `template_text`'s one setting, `context_blueprints`: the Blueprints whose
 * Fields an editor is offered as placeholders. Blueprint ids, not Release
 * Pins (ADR-0020): they steer the editor's picker and nothing that reads the
 * Content needs them resolved — what a template may name at render time is
 * the rendering service's context contract, not a Spec.
 */
export interface TemplateTextSettings {
	context_blueprints?: string[];
}

/**
 * `template_text` — the source of a template a service renders into
 * generated Content: a string, in the template language the rendering service
 * reads (core's Go `text/template`). fieldkit checks that it is a string and
 * nothing more; whether it parses, and what its placeholders may name, is the
 * rendering service's rule, not the data contract's — a check fieldkit made
 * here could never be the one the renderer makes.
 *
 * It has no text: a template's source, `{{ .Count }}` and all, is not what a
 * reader searches for, and the Content it renders is indexed as itself. It
 * yields no edges — what a placeholder names is resolved at render time.
 *
 * It sits at the root of a Blueprint only; that the Blueprint be a generated
 * Content's is the Consumer's Policy, not a Position. Its editing UI is the
 * Textarea's until the template editor is ported (#267).
 */
export const templateTextPlugin: FieldTypePlugin<TemplateTextSettings> = {
	id: "template_text",
	name: "Template text",
	description: "The source of a template rendered into generated Content",
	icon: Braces,
	category: "text",

	fieldComponent:
		TextareaField as FieldTypePlugin<TemplateTextSettings>["fieldComponent"],
	cellComponent:
		TextareaCell as FieldTypePlugin<TemplateTextSettings>["cellComponent"],

	toZodType(field: Field<TemplateTextSettings>) {
		const schema = z.string();
		return field.config.required
			? schema.min(1, `${field.config.name} is required`)
			: schema;
	},

	settingsSchema: z
		.object({
			context_blueprints: z.array(z.string().min(1)).optional(),
		})
		.strict(),

	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	defaultSettings: {},

	defaultValue: () => "",

	consumers: ["blueprint"],
	positions: ["root"],
};
