// src/schema/content-walk.ts
//
// `edges()` and `texts()`: a whole Content's data walked against the Resolved
// Spec it was validated with — the TS twins of the Go module's `Edges` and
// `Texts`, held to the same answers by the shared `edges` and `texts`
// fixtures (ADR-0018).
//
// One walk serves both. Every Field is read by its own plugin's `text` or
// `edges`, and a container hands what it holds back to the walk through its
// `records` (ADR-0007), so the walk never learns a type's name.

import type {
	EdgeTarget,
	FieldTypePlugin,
	ValueContext,
	ValueEdge,
} from "./plugin";
import type { ResolvedSpec } from "./resolve-spec";
import { toPluginMap } from "./row-ids";
import type { SearchWeight } from "./search";
import type { Field } from "./types";
import { isPlainObject, isUnset, stripUnset } from "./unset";
import { toPath } from "./validate-settings";
import { fieldHoldsValue } from "./zod-builder";

/** One Content Graph edge a Content's data holds (contenthub ADR 0009). Go's
 * `Edge`. */
export interface Edge {
	/** The value it comes from, `/`-separated from the data's root with each
	 * row as its `_id` (ADR-0023): `/gallery`, `/sections/r1/image`. */
	path: string;
	/** `media`, or a kind a later type adds. */
	kind: string;
	target: EdgeTarget;
}

/** The plain text one Field's value yields, and its Delivery Search weight.
 * Go's `FieldText`. */
export interface FieldText {
	/** The value's path, as an {@link Edge}'s. */
	path: string;
	/** The Field's `config.search`, `D` when Unset — never `off`: such a
	 * Field yields none. */
	weight: Exclude<SearchWeight, "off">;
	/** Never `""`. */
	text: string;
}

type Plugins =
	| readonly FieldTypePlugin[]
	| ReadonlyMap<string, FieldTypePlugin<unknown>>;

type Visit = (
	field: Field,
	plugin: FieldTypePlugin,
	value: unknown,
	segments: readonly string[],
	/** The Field is hidden, or sits inside a hidden one (#223 D4). */
	hidden: boolean,
) => void;

/**
 * Visits every Field of a record that holds a value, in Spec order, then —
 * through its plugin's `records` — every Field of what it holds. Markers are
 * skipped, and so is a Field whose value is absent, or whose type no plugin
 * implements. A hidden Field is visited, as validation checks it (#223 D4),
 * and told so — as is every Field inside it: `inHidden`.
 */
function walkFields(
	fields: readonly Field[],
	record: Record<string, unknown>,
	segments: readonly string[],
	plugins: ReadonlyMap<string, FieldTypePlugin>,
	visit: Visit,
	context: ValueContext,
	inHidden = false,
): void {
	for (const field of fields) {
		if (!isPlainObject(field) || !isPlainObject(field.config)) continue;
		if (!fieldHoldsValue(field)) continue;
		const accessor = field.config.api_accessor;
		// Unset was stripped: a value that is still here is one.
		const value = record[accessor];
		if (value === undefined) continue;
		const plugin = plugins.get(field.field_type);
		if (!plugin) continue;
		const at = [...segments, accessor];
		const hidden = inHidden || Boolean(field.config.hidden);
		visit(field, plugin, value, at, hidden);
		for (const held of plugin.records?.(field, value, context) ?? []) {
			walkFields(
				held.fields,
				held.record,
				[...at, ...held.segments],
				plugins,
				visit,
				context,
				hidden,
			);
		}
	}
}

/** Walks data as Go's walker reads it: Unset stripped at every depth. Data
 * that is not an object is refused; `undefined` is `{}`. */
function walkData(
	resolved: ResolvedSpec,
	data: unknown,
	plugins: Plugins,
	visit: Visit,
	operation: string,
	context: ValueContext,
): void {
	const canonical = stripUnset(data === undefined ? {} : data);
	if (!isPlainObject(canonical)) {
		throw new TypeError(`fieldkit: ${operation}: data is not an object`);
	}
	walkFields(
		resolved.fields,
		canonical,
		[],
		toPluginMap(plugins),
		visit,
		context,
	);
}

/**
 * Every Content Graph edge a Content's data holds, against the Resolved Spec
 * it was validated with: each Field's own, through every container at every
 * depth — rows, Blocks, a resolved Fieldset's record — in Spec order, then
 * row order. The same answers as the Go module's `Edges`.
 *
 * It reads data validation accepted, and checks nothing: a value of the wrong
 * shape yields no edge. Markers yield none, and neither does a `lookup`; a
 * hidden Field yields its edges like any other, so the Content Graph stays
 * complete (#223 D4). Throws on data that is not an object. `options` is
 * validation's: whose Blueprint each referenced Content is (`ValueContext`).
 */
export function edges(
	resolved: ResolvedSpec,
	data: unknown,
	plugins: Plugins,
	options: ValueContext = {},
): Edge[] {
	const out: Edge[] = [];
	walkData(
		resolved,
		data,
		plugins,
		(field, plugin, value, segments) => {
			for (const edge of plugin.edges?.(field, value) ?? []) {
				out.push(toEdge(edge, segments));
			}
		},
		"edges",
		options,
	);
	return out;
}

function toEdge(edge: ValueEdge, segments: readonly string[]): Edge {
	return {
		path: toPath([...segments, ...(edge.segments ?? [])]),
		kind: edge.kind,
		target: edge.target,
	};
}

/**
 * The plain texts a Content's data yields for Delivery Search (contenthub ADR
 * 0019): one per Field whose plugin has `text`, through every container at
 * every depth, in Spec order, then row order. The same answers as the Go
 * module's `Texts`.
 *
 * Each Field weighs by its own `config.search`, inside a row as at the root:
 * `off` yields nothing, and Unset weighs `D`. A value yielding no text yields
 * nothing; markers yield none. A hidden Field — or one inside a hidden Field
 * — yields none unless its `search` is set, and then weighs that (#223 D4).
 * Throws on data that is not an object. `options` is validation's (`ValueContext`): a Reference's values
 * are read only against the Reference Spec they follow.
 */
export function texts(
	resolved: ResolvedSpec,
	data: unknown,
	plugins: Plugins,
	options: ValueContext = {},
): FieldText[] {
	const out: FieldText[] = [];
	walkData(
		resolved,
		data,
		plugins,
		(field, plugin, value, segments, hidden) => {
			if (!plugin.text) return;
			const search = field.config.search;
			if (search === "off") return;
			if (hidden && isUnset(search)) return;
			const text = plugin.text(field, value);
			if (text === "") return;
			// Unset — absent, `null`, `""` — weighs D (ADR-0021).
			const weight = isUnset(search) ? "D" : (search as FieldText["weight"]);
			out.push({ path: toPath(segments), weight, text });
		},
		"texts",
		options,
	);
	return out;
}

/**
 * The plain text one Field's stored value yields — Go's `ValueText` — `""`
 * for a type without text, an Unset value, or a value not of the type's
 * shape. A container yields none of its own: `texts()` reads its children.
 */
export function valueText(
	field: Field,
	value: unknown,
	plugins: Plugins,
): string {
	const plugin = toPluginMap(plugins).get(field.field_type);
	const canonical = stripUnset(value);
	if (!plugin?.text || isUnset(canonical)) return "";
	return plugin.text(field, canonical);
}
