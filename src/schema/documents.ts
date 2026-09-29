// src/schema/documents.ts
//
// The rich-text document boundary (ADR-0025). A value whose plugin is an
// `opaqueDocument` — `rich_text`'s, knkeditor's — is another module's inside:
// ADR-0021's canonical form stops at it, and so does the `too_deep` cap, which
// counts fieldkit's structure only. The size caps still count the whole
// document. Go's `documentPaths` (go/documents.go) finds the same documents.

import type { FieldTypePlugin, ValueContext } from "./plugin";
import type { Field } from "./types";
import { isPlainObject } from "./unset";

/** The value-less Markers, as `specToZodSchema` skips them. Hidden Fields are
 * not skipped: their values are checked like any other (#223 D4). */
const MARKER_TYPES: ReadonlySet<string> = new Set(["section", "card"]);

/**
 * Every document the data's Fields hold, at every depth the containers reach
 * through their `records`, found in the data as it stands — before Unset is
 * stripped. A document is an `opaqueDocument` Field's value that is an object
 * holding anything: `{}` and `null` are Unset at the Field. Hidden Fields
 * hold documents too.
 *
 * Documents sit in fieldkit's structure, never deeper than `maxDepth`, so with
 * one the search reads the data cut off below it: a document nested deeper is
 * too deep itself, and the containers' walk never runs away down a
 * pathological tree.
 */
export function valueDocuments(
	fields: readonly Field[],
	data: unknown,
	plugins: ReadonlyMap<string, FieldTypePlugin>,
	context: ValueContext = {},
	maxDepth = Number.POSITIVE_INFINITY,
): ReadonlySet<object> {
	const found = new Set<object>();
	if (![...plugins.values()].some((p) => p.opaqueDocument)) return found;
	if (!isPlainObject(data)) return found;

	let originals: WeakMap<object, object> | undefined;
	let record: Record<string, unknown> = data;
	// Without a limit there is nothing to cut off — and no reason to walk a
	// document's inside, which may nest deeper than any call stack.
	if (Number.isFinite(maxDepth) && deeperThan(data, 0, maxDepth)) {
		originals = new WeakMap();
		record = boundedCopy(data, 0, maxDepth, originals) as Record<
			string,
			unknown
		>;
	}
	const add = (document: object) => {
		found.add(originals?.get(document) ?? document);
	};
	findDocuments(fields, record, plugins, context, add);
	return found;
}

function findDocuments(
	fields: readonly Field[],
	record: Record<string, unknown>,
	plugins: ReadonlyMap<string, FieldTypePlugin>,
	context: ValueContext,
	add: (document: object) => void,
): void {
	for (const field of fields) {
		if (!isPlainObject(field) || !isPlainObject(field.config)) continue;
		if (MARKER_TYPES.has(field.field_type)) continue;
		const value = record[field.config.api_accessor];
		if (value === undefined) continue;
		const plugin = plugins.get(field.field_type);
		if (!plugin) continue;
		if (plugin.opaqueDocument) {
			if (isPlainObject(value) && Object.keys(value).length > 0) add(value);
			continue;
		}
		for (const held of plugin.records?.(field, value, context) ?? []) {
			findDocuments(held.fields, held.record, plugins, context, add);
		}
	}
}

/** Whether value, sitting at depth, holds an array or object deeper than
 * limit. Stops at the first: it never recurses past `limit + 1`. */
function deeperThan(value: unknown, depth: number, limit: number): boolean {
	if (Array.isArray(value)) {
		if (depth > limit) return true;
		return value.some((item) => deeperThan(item, depth + 1, limit));
	}
	if (isPlainObject(value)) {
		if (depth > limit) return true;
		return Object.values(value).some((child) =>
			deeperThan(child, depth + 1, limit),
		);
	}
	return false;
}

/** value with every container deeper than limit emptied — an object keeping
 * only its `_id`, so the items beside it keep their segments — each copied
 * object mapped to its original in `originals`. */
function boundedCopy(
	value: unknown,
	depth: number,
	limit: number,
	originals: WeakMap<object, object>,
): unknown {
	if (Array.isArray(value)) {
		if (depth > limit) return [];
		return value.map((item) => boundedCopy(item, depth + 1, limit, originals));
	}
	if (!isPlainObject(value)) return value;
	const copy: Record<string, unknown> = {};
	if (depth > limit) {
		if ("_id" in value) copy._id = value._id;
	} else {
		for (const [key, child] of Object.entries(value)) {
			copy[key] = boundedCopy(child, depth + 1, limit, originals);
		}
	}
	originals.set(copy, value);
	return copy;
}
