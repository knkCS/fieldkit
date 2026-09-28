/**
 * The Catalogue compatibility rule (ADR-0019): a Catalogue may only grow.
 *
 * `compareCatalogues(released, next)` lists every way `next` breaks what
 * `released` promised; an empty list is a pass. A released Blueprint is
 * served for ever, so anything it could hold must stay valid: a type, a
 * setting, an enum value, a Position or a Pin is never taken away, and no
 * setting becomes required or changes type. Loosening is fine — a value once
 * rejected may become valid (ADR-0019) — so a widened enum, a relaxed bound or
 * a newly open object passes.
 *
 * A rename is a removal plus an addition, and fails as the removal.
 *
 * Where the rule cannot tell tightening from loosening — a JSON Schema keyword
 * it does not know — it fails rather than guesses. The generator only emits
 * the keywords the Go validator implements (scripts/catalogue.ts), and those
 * are the ones judged here; widen all three together.
 */

import { compareVersions } from "./versions";

export type JsonSchema = { [keyword: string]: unknown };

export interface CatalogueType {
	id: string;
	since: string;
	settings_schema: JsonSchema;
	positions: string[];
	consumers: string[];
	pins: { key: string; kind: string }[];
	has_text: boolean;
}

export interface Catalogue {
	version: string;
	types: CatalogueType[];
}

export function compareCatalogues(
	released: Catalogue,
	next: Catalogue,
): string[] {
	const breaks: string[] = [];
	const nextById = new Map(next.types.map((t) => [t.id, t]));
	const releasedIds = new Set(released.types.map((t) => t.id));

	breaks.push(...versionBreaks(released, next));

	for (const old of released.types) {
		const now = nextById.get(old.id);
		if (!now) {
			breaks.push(`${old.id}: the type was removed`);
			continue;
		}
		breaks.push(...typeBreaks(old, now).map((b) => `${old.id}: ${b}`));
	}

	for (const added of next.types) {
		if (releasedIds.has(added.id)) continue;
		// A type's `since` is the Catalogue that first listed it, so a type
		// first listed now carries the version it ships in.
		if (added.since !== next.version) {
			breaks.push(
				`${added.id}: a new type's since must be the Catalogue version ${next.version}, not "${added.since}"`,
			);
		}
	}
	return breaks;
}

/**
 * A Catalogue version names exactly one Catalogue: a Resolved Spec records
 * it (ADR-0019), and a service compares it to decide whether it understands a
 * Blueprint Release. So a change moves it forward, and no change leaves it
 * where the last release put it.
 */
function versionBreaks(released: Catalogue, next: Catalogue): string[] {
	const order = compareVersions(next.version, released.version);
	if (order < 0) {
		return [
			`the Catalogue version moved back from ${released.version} to ${next.version}`,
		];
	}
	const changed = !sameJson(released.types, next.types);
	if (changed && order === 0) {
		return [
			`the Catalogue changed since ${released.version} but its version is still ${next.version}: set CATALOGUE_VERSION in scripts/catalogue.ts to the release that will ship it`,
		];
	}
	if (!changed && order > 0) {
		return [
			`the Catalogue is unchanged since ${released.version} but its version is ${next.version}: a version names one Catalogue, so keep ${released.version}`,
		];
	}
	return [];
}

function typeBreaks(old: CatalogueType, now: CatalogueType): string[] {
	const breaks: string[] = [];
	if (old.since !== now.since) {
		breaks.push(`since changed from "${old.since}" to "${now.since}"`);
	}
	breaks.push(
		...schemaBreaks(old.settings_schema, now.settings_schema, "").map(
			(b) => `settings ${b}`,
		),
	);
	for (const position of old.positions) {
		if (!now.positions.includes(position)) {
			breaks.push(`Position "${position}" was removed`);
		}
	}
	// Consumers are not compared: they only filter type pickers (ADR-0022), so
	// dropping one stops new Fields of the type there and invalidates nothing
	// already stored.
	for (const pin of old.pins) {
		if (!now.pins.some((p) => p.key === pin.key && p.kind === pin.kind)) {
			breaks.push(`Pin "${pin.key}" (${pin.kind}) was removed`);
		}
	}
	if (old.has_text !== now.has_text) {
		breaks.push(`has_text changed from ${old.has_text} to ${now.has_text}`);
	}
	return breaks;
}

/** Lower bounds: tightening raises them. */
const LOWER_BOUNDS = ["minimum", "exclusiveMinimum", "minLength"];
/** Upper bounds: tightening lowers them. */
const UPPER_BOUNDS = ["maximum", "exclusiveMaximum", "maxLength"];
/** Keywords judged by the dedicated rules below, not as bounds. */
const STRUCTURE = [
	"type",
	"properties",
	"additionalProperties",
	"required",
	"items",
	"enum",
];
const KNOWN = new Set([...STRUCTURE, ...LOWER_BOUNDS, ...UPPER_BOUNDS]);

function schemaBreaks(old: JsonSchema, now: JsonSchema, at: string): string[] {
	const where = at || "/";
	const breaks: string[] = [];

	// Type: the set of allowed types may grow ("string" → ["string", "null"]),
	// never lose one. An absent `type` allows every type, so dropping it is a
	// loosening and adding one a tightening. integer → number would be a
	// loosening too, but it is rare enough to be judged by a person as a new
	// type id instead.
	if (!sameJson(old.type, now.type)) {
		const before = typeSet(old.type);
		const after = typeSet(now.type);
		if (after && (!before || before.some((t) => !after.includes(t)))) {
			breaks.push(
				`${where} changed type from ${JSON.stringify(old.type)} to ${JSON.stringify(now.type)}`,
			);
		}
	}

	// Properties: none removed; added ones are fine unless required (below).
	const oldProps = (old.properties ?? {}) as Record<string, JsonSchema>;
	const nowProps = (now.properties ?? {}) as Record<string, JsonSchema>;
	for (const [key, schema] of Object.entries(oldProps)) {
		if (!(key in nowProps)) {
			breaks.push(`${at}/${key} was removed`);
			continue;
		}
		breaks.push(...schemaBreaks(schema, nowProps[key], `${at}/${key}`));
	}

	const oldRequired = new Set((old.required ?? []) as string[]);
	for (const key of (now.required ?? []) as string[]) {
		if (!oldRequired.has(key)) breaks.push(`${at}/${key} is newly required`);
	}

	// additionalProperties: absent and `true` both allow anything, and a
	// schema allows what it describes. Closing an object, or narrowing what it
	// lets through, fails; opening one is a loosening.
	const oldExtra = old.additionalProperties ?? true;
	const nowExtra = now.additionalProperties ?? true;
	if (oldExtra !== false && nowExtra === false) {
		breaks.push(`${where} no longer allows additional properties`);
	} else if (isSchema(oldExtra) && isSchema(nowExtra)) {
		breaks.push(
			...schemaBreaks(oldExtra, nowExtra, `${at}/additionalProperties`),
		);
	} else if (oldExtra === true && isSchema(nowExtra)) {
		breaks.push(`${where} narrowed its additional properties`);
	}

	if (isSchema(old.items)) {
		if (isSchema(now.items)) {
			breaks.push(...schemaBreaks(old.items, now.items, `${at}/items`));
		} else if (now.items !== undefined) {
			breaks.push(`${at}/items changed shape`);
		}
	} else if (old.items === undefined && now.items !== undefined) {
		breaks.push(`${at}/items gained a schema`);
	}

	if (Array.isArray(old.enum)) {
		if (Array.isArray(now.enum)) {
			for (const value of old.enum) {
				if (!now.enum.some((v) => sameJson(v, value))) {
					breaks.push(`${where} no longer allows ${JSON.stringify(value)}`);
				}
			}
		}
		// An enum dropped entirely allows every value it allowed: a loosening.
	} else if (now.enum !== undefined) {
		breaks.push(`${where} gained an enum`);
	}

	for (const keyword of [...LOWER_BOUNDS, ...UPPER_BOUNDS]) {
		const before = old[keyword] as number | undefined;
		const after = now[keyword] as number | undefined;
		if (after === undefined || before === after) continue;
		if (before === undefined) {
			breaks.push(`${where} gained ${keyword} ${after}`);
			continue;
		}
		const tighter = LOWER_BOUNDS.includes(keyword)
			? after > before
			: after < before;
		if (tighter) {
			breaks.push(`${where} tightened ${keyword} from ${before} to ${after}`);
		}
	}

	const keywords = new Set([...Object.keys(old), ...Object.keys(now)]);
	for (const keyword of [...keywords].sort()) {
		if (KNOWN.has(keyword)) continue;
		if (!sameJson(old[keyword], now[keyword])) {
			breaks.push(
				`${where} changed "${keyword}", which this check cannot judge`,
			);
		}
	}
	return breaks;
}

function typeSet(type: unknown): string[] | undefined {
	if (type === undefined) return undefined;
	return Array.isArray(type) ? (type as string[]) : [type as string];
}

function isSchema(value: unknown): value is JsonSchema {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural equality of JSON values, blind to object key order. */
function sameJson(a: unknown, b: unknown): boolean {
	return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (isSchema(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "undefined";
}
