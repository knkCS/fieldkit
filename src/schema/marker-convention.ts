import type { Field, Schema } from "./types";

export type MarkerConvention = "asterisk" | "optional-text";

/**
 * §10 (anker page-patterns): one marker convention per form. Forms with
 * mostly-required fields mark the optionals ("optional-text"); forms
 * with mostly-optional fields mark the required ones ("asterisk").
 *
 * Counts fields that render a label: `section`/`card` markers and hidden
 * fields are excluded (a hidden field renders nothing, so its children
 * are skipped too, mirroring the renderer and zod-builder). Group
 * children are recursed into like validateSpec's accessor walk — but
 * unlike that walk, section/hidden fields are dropped from the count.
 * Fields nested inside `blocks`/`array` settings are NOT counted (they
 * live outside `Field.children`, mirroring validateSpec's limitation).
 * A STRICT majority of required fields (required > optional) selects
 * "optional-text"; ties, empty schemas, and required-minorities select
 * "asterisk" (the conventional default).
 */
export function resolveMarkerConvention(schema: Schema): MarkerConvention {
	const { required, optional } = countFields(schema);
	return required > optional ? "optional-text" : "asterisk";
}

function countFields(fields: Field[]): { required: number; optional: number } {
	let required = 0;
	let optional = 0;
	for (const field of fields) {
		if (field.field_type === "section" || field.field_type === "card") continue;
		if (field.config.hidden) continue;
		if (field.config.required) required++;
		else optional++;
		if (field.children && field.children.length > 0) {
			const child = countFields(field.children);
			required += child.required;
			optional += child.optional;
		}
	}
	return { required, optional };
}
