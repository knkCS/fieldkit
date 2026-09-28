// src/schema/unset.ts
import type { Field, Schema } from "./types";

/**
 * Whether a value is **Unset** — absent, `null`, `""`, `[]` or `{}`
 * (ADR-0021). `0` and `false` are values, and so is an object that is not a
 * plain record — a `Date`, a `File` — which JSON never holds but a form might.
 */
export function isUnset(value: unknown): boolean {
	if (value === undefined || value === null || value === "") return true;
	if (Array.isArray(value)) return value.length === 0;
	if (isPlainObject(value)) return Object.keys(value).length === 0;
	return false;
}

/** A record as JSON makes one: its prototype is `Object.prototype`, or none. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Drops every object key whose value is Unset, at every depth, deepest first —
 * so `{ a: { b: null } }` loses `a` too. Array elements are kept, Unset or
 * not: `[null]` holds one element, and is not `[]`. Only plain records are
 * looked into; the input is not mutated.
 */
export function stripUnset(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripUnset);
	if (!isPlainObject(value)) return value;
	const kept: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		const canonical = stripUnset(child);
		if (!isUnset(canonical)) kept[key] = canonical;
	}
	return kept;
}

/**
 * A value in its **canonical stored form** (ADR-0021): every Unset key
 * stripped at every depth, and an Unset value as a whole `undefined` — absent,
 * the one stored form of Unset. What TS stores is what Go's `ValidateValue`
 * accepts, which rejects any other form as `not_canonical`.
 *
 * `canonicalValue({ title: "", tags: [], count: 0 })` is `{ count: 0 }`.
 */
export function canonicalValue(value: unknown): unknown {
	const canonical = stripUnset(value);
	return isUnset(canonical) ? undefined : canonical;
}

/**
 * A Spec with every Field's `settings` in canonical form: Unset settings
 * stripped at every depth, and Unset `settings` as a whole dropped from the
 * Field (ADR-0021). Children are canonicalised too; a Block Type's Fields
 * live in settings and are stripped with them. `config` and `validation` are
 * left as they are.
 *
 * Fields whose settings are already canonical keep their identity, and so
 * does a Spec none of whose Fields changed.
 */
export function canonicalSpecSettings(spec: Schema): Schema {
	let changed = false;
	const next = spec.map((field) => {
		const canonical = canonicalFieldSettings(field);
		if (canonical !== field) changed = true;
		return canonical;
	});
	return changed ? next : spec;
}

function canonicalFieldSettings(field: Field): Field {
	const children =
		field.children != null
			? canonicalSpecSettings(field.children)
			: field.children;
	const hasSettings = "settings" in field;
	const settings = hasSettings ? canonicalValue(field.settings) : undefined;
	const settingsChanged =
		hasSettings &&
		(settings === undefined ||
			JSON.stringify(settings) !== JSON.stringify(field.settings));
	if (!settingsChanged && children === field.children) return field;
	const next: Field = { ...field, children };
	if (children === undefined) delete next.children;
	if (settings === undefined) delete next.settings;
	else next.settings = settings;
	return next;
}
