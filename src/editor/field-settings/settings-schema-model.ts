// src/editor/field-settings/settings-schema-model.ts
import type { ZodTypeAny } from "zod";
import { isUnset } from "../../schema/validate-settings";

/**
 * What the generic settings form reads out of a Field Type's `settingsSchema`,
 * and the one rule for writing back through it.
 *
 * A pure walk over the **Zod** schema, not the generated JSON Schema: the
 * editor has the plugin in hand, and the Zod object is the definition the
 * Catalogue is generated from (ADR-0018). No React here — the form renders the
 * answer, and tests read it without mounting anything.
 *
 * The walk knows a closed set of shapes. Whatever falls outside it — a record,
 * a list of objects, a union of anything but string literals, `unknown` —
 * becomes `json`, which the form shows as stored and never writes. A generic
 * form that guessed at a shape it cannot model would write settings the schema
 * refuses.
 */

/** A value a single control edits. */
export type ScalarSettingShape =
	| { kind: "string" }
	| {
			kind: "number";
			integer: boolean;
			/** Inclusive bounds only — an exclusive one (`positive()`) has no
			 * honest `min` attribute, and the schema still refuses it. */
			min?: number;
			max?: number;
	  }
	| { kind: "enum"; options: string[] };

export type SettingShape =
	| ScalarSettingShape
	| {
			kind: "boolean";
			/** The schema's own default, when it declares one — what an absent
			 * key means, and so what an unchecked box must not be confused with. */
			defaultValue?: boolean;
	  }
	| { kind: "list"; item: ScalarSettingShape }
	| { kind: "object"; fields: SettingEntry[] }
	| { kind: "json" };

/** One declared settings key. */
export interface SettingEntry {
	key: string;
	/** The key made readable. Setting names are the type author's vocabulary,
	 * not the editor's, so they do not pass through `labels`. */
	label: string;
	/** From the schema's `.describe()`, when it has one. */
	description?: string;
	shape: SettingShape;
}

/** Zod v3's internal type tag — the only reliable way to tell schemas apart
 * across a dependency boundary, where `instanceof` can fail on a second copy
 * of zod. */
function typeName(schema: ZodTypeAny): string | undefined {
	return (schema._def as { typeName?: string }).typeName;
}

interface Unwrapped {
	schema: ZodTypeAny;
	description?: string;
	defaultValue?: unknown;
}

/**
 * Peels the wrappers that change whether a key may be absent, or add checks a
 * form cannot show, down to the schema describing the value itself.
 */
function unwrap(schema: ZodTypeAny): Unwrapped {
	let current = schema;
	let description = schema.description;
	let defaultValue: unknown;
	for (;;) {
		description ??= current.description;
		const def = current._def as Record<string, unknown>;
		switch (typeName(current)) {
			case "ZodOptional":
			case "ZodNullable":
			case "ZodReadonly":
			case "ZodCatch":
				current = def.innerType as ZodTypeAny;
				continue;
			case "ZodDefault":
				if (defaultValue === undefined) {
					defaultValue = (def.defaultValue as () => unknown)();
				}
				current = def.innerType as ZodTypeAny;
				continue;
			case "ZodBranded":
				current = def.type as ZodTypeAny;
				continue;
			case "ZodEffects":
				current = def.schema as ZodTypeAny;
				continue;
			default:
				return { schema: current, description, defaultValue };
		}
	}
}

function numberShape(schema: ZodTypeAny): ScalarSettingShape {
	const checks =
		((schema._def as { checks?: unknown[] }).checks as {
			kind: string;
			value?: number;
			inclusive?: boolean;
		}[]) ?? [];
	const shape: {
		kind: "number";
		integer: boolean;
		min?: number;
		max?: number;
	} = { kind: "number", integer: false };
	for (const check of checks) {
		if (check.kind === "int") shape.integer = true;
		if (check.kind === "min" && check.inclusive && check.value !== undefined)
			shape.min = check.value;
		if (check.kind === "max" && check.inclusive && check.value !== undefined)
			shape.max = check.value;
	}
	return shape;
}

/** The string options of an enum-like schema, or `undefined` when it is not
 * one. */
function enumOptions(schema: ZodTypeAny): string[] | undefined {
	const def = schema._def as Record<string, unknown>;
	switch (typeName(schema)) {
		case "ZodEnum":
			return [...(def.values as string[])];
		case "ZodNativeEnum": {
			const values = Object.values(def.values as Record<string, unknown>);
			return values.every((v) => typeof v === "string")
				? (values as string[])
				: undefined;
		}
		case "ZodLiteral":
			return typeof def.value === "string" ? [def.value] : undefined;
		case "ZodUnion": {
			const options: string[] = [];
			for (const option of def.options as ZodTypeAny[]) {
				const inner = enumOptions(unwrap(option).schema);
				if (!inner) return undefined;
				options.push(...inner);
			}
			return options;
		}
		default:
			return undefined;
	}
}

function scalarShape(schema: ZodTypeAny): ScalarSettingShape | undefined {
	switch (typeName(schema)) {
		case "ZodString":
			return { kind: "string" };
		case "ZodNumber":
			return numberShape(schema);
	}
	const options = enumOptions(schema);
	return options ? { kind: "enum", options } : undefined;
}

function shapeOf(unwrapped: Unwrapped): SettingShape {
	const { schema } = unwrapped;
	if (typeName(schema) === "ZodBoolean") {
		return typeof unwrapped.defaultValue === "boolean"
			? { kind: "boolean", defaultValue: unwrapped.defaultValue }
			: { kind: "boolean" };
	}
	if (typeName(schema) === "ZodArray") {
		const item = scalarShape(
			unwrap((schema._def as { type: ZodTypeAny }).type).schema,
		);
		return item ? { kind: "list", item } : { kind: "json" };
	}
	if (typeName(schema) === "ZodObject") {
		return { kind: "object", fields: entriesOf(schema) };
	}
	return scalarShape(schema) ?? { kind: "json" };
}

function entriesOf(objectSchema: ZodTypeAny): SettingEntry[] {
	const shape = (
		objectSchema as unknown as { shape: Record<string, ZodTypeAny> }
	).shape;
	return Object.entries(shape).map(([key, child]) => {
		const unwrapped = unwrap(child);
		const entry: SettingEntry = {
			key,
			label: humanizeSettingKey(key),
			shape: shapeOf(unwrapped),
		};
		if (unwrapped.description) entry.description = unwrapped.description;
		return entry;
	});
}

/**
 * The declared settings keys of a `settingsSchema`, each with the control
 * that edits it — or `null` when the schema is not an object at all, which
 * leaves nothing a form could lay out.
 */
export function describeSettingsSchema(
	schema: ZodTypeAny,
): SettingEntry[] | null {
	const root = unwrap(schema).schema;
	if (typeName(root) !== "ZodObject") return null;
	return entriesOf(root);
}

/** `max_items_per_page` → "Max items per page"; `allowBlank` → "Allow blank". */
export function humanizeSettingKey(key: string): string {
	const words = key
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.trim()
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `value` narrowed to the keys `entries` declare, with every Unset key
 * dropped, deepest first — so a nested object left with nothing in it goes
 * too. Key order is the stored order, so an edit does not reshuffle a Field's
 * settings.
 */
function project(
	entries: SettingEntry[],
	value: unknown,
): Record<string, unknown> {
	const kept: Record<string, unknown> = {};
	if (!isRecord(value)) return kept;
	const byKey = new Map(entries.map((entry) => [entry.key, entry]));
	for (const [key, child] of Object.entries(value)) {
		const entry = byKey.get(key);
		if (!entry) continue;
		const canonical =
			entry.shape.kind === "object"
				? project(entry.shape.fields, child)
				: child;
		if (!isUnset(canonical)) kept[key] = canonical;
	}
	return kept;
}

/**
 * The settings after one key is set to `value`.
 *
 * It writes **only the keys the schema declares** — a key the schema does not
 * know is `unknown_setting` to `validateSpec()`, and passing it through would
 * make every save report an error the Author never made — and it keeps
 * **Unset out of what it writes**: an emptied control removes its key rather
 * than storing `""` (ADR-0021). `0` and `false` are values and stay.
 */
export function writeSetting(
	entries: SettingEntry[],
	current: unknown,
	key: string,
	value: unknown,
): Record<string, unknown> {
	const base = isRecord(current) ? current : {};
	return project(entries, { ...base, [key]: value });
}
