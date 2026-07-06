import type { Field, Schema } from "./types";

export type MarkerConvention = "asterisk" | "optional-text";

/**
 * §10 (anker page-patterns): one marker convention per form. Forms with
 * mostly-required fields mark the optionals ("optional-text"); forms
 * with mostly-optional fields mark the required ones ("asterisk").
 *
 * Counts input fields only: `section` markers are excluded; group
 * children are recursed into (same traversal contract as validateSpec)
 * and the group field itself is counted — it renders a label too.
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
		if (field.field_type === "section") continue;
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
