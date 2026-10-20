// src/schema/value-text.ts
//
// The `text()` of every type that has text — the plain text a value yields for
// Delivery Search (contenthub ADR 0019). Each is the TS twin of a Go
// `textRule` (go/texts.go); the shared `texts` fixtures hold the two to one
// answer. A value not of the type's shape yields `""`: `texts()` reads what
// validation accepted, and never reports.

import { choiceOptions, inOptionOrder, optionLabel } from "./choice-options";
import type { Field } from "./types";

/** A string value itself. */
export function stringText(_field: Field, value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** A List's Entries, one per line; a blank Entry adds no line. */
export function listText(_field: Field, value: unknown): string {
	if (!Array.isArray(value)) return "";
	return value
		.filter((entry): entry is string => typeof entry === "string" && !!entry)
		.join("\n");
}

/**
 * An Array's keys and values, each non-blank one a line: pair by pair in a
 * list, and in a keyed Array key by key, the keys sorted by UTF-16 code units
 * — JS's default sort — since an object's keys have no order Go's JSON reader
 * keeps.
 */
export function arrayText(
	field: Field<{ mode?: string } | undefined>,
	value: unknown,
): string {
	const lines: string[] = [];
	const add = (half: unknown) => {
		if (typeof half === "string" && half !== "") lines.push(half);
	};
	if (field.settings?.mode === "keyed") {
		if (!isRecord(value)) return "";
		for (const key of Object.keys(value).sort()) {
			add(key);
			add(value[key]);
		}
	} else {
		if (!Array.isArray(value)) return "";
		for (const pair of value) {
			if (!isRecord(pair)) continue;
			add(pair.key);
			add(pair.value);
		}
	}
	return lines.join("\n");
}

/**
 * A choice type's text — `select`, `radio`, `checkboxes` (#223 D6): the Label
 * `settings.options` gives each selected Key, one per line, in the Options'
 * order (ADR-0028) whatever order the value holds them in. A Key without a
 * Label — no Option has it, or its Label is `""` — adds no line: a Key is an
 * identifier, never text. `checkboxes` and a multiple `select` hold a list of
 * Keys, `radio` and a single `select` one Key.
 */
export function choiceText(
	field: Field<{ options?: unknown; multiple?: boolean } | undefined>,
	value: unknown,
): string {
	const options = choiceOptions(field.settings);
	if (options.length === 0) return "";
	const many = field.field_type === "checkboxes" || !!field.settings?.multiple;
	let keys: unknown[];
	if (many) {
		if (!Array.isArray(value)) return "";
		keys = value;
	} else {
		if (typeof value !== "string") return "";
		keys = [value];
	}
	const lines: string[] = [];
	for (const key of inOptionOrder(options, keys)) {
		const label = optionLabel(options, key);
		if (label) lines.push(label);
	}
	return lines.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
