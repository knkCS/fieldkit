// src/schema/row-ids.ts
import {
	addIssueToContext,
	type ParseInput,
	ZodArray,
	type ZodTypeAny,
	z,
} from "zod";
import type { FieldTypePlugin, MintIdsContext } from "./plugin";
import type { Field } from "./types";
import { isPlainObject } from "./unset";
import { toPath } from "./validate-settings";
import { fieldProducesValue } from "./zod-builder";

/**
 * Most characters — UTF-16 code units, as JS counts a string's length — a
 * row's `_id` may hold (ADR-0023). The Go module's `MaxIDLength` is the same.
 */
export const ROW_ID_MAX_LENGTH = 64;

/** The `_id` every row carries: an opaque, non-empty string of at most
 * {@link ROW_ID_MAX_LENGTH} characters (ADR-0023). */
export const rowIdSchema = z.string().min(1).max(ROW_ID_MAX_LENGTH);

/** Whether a value is a well-formed `_id`. Unique is the row array's rule,
 * not the id's. */
export function isRowId(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= ROW_ID_MAX_LENGTH
	);
}

/**
 * A fresh `_id`: a random UUID. `crypto.randomUUID` where the platform offers
 * it — a browser offers it on secure origins only — and a version-4 UUID from
 * `crypto.getRandomValues` otherwise.
 */
export function mintId(): string {
	const cryptoApi = globalThis.crypto;
	if (typeof cryptoApi?.randomUUID === "function")
		return cryptoApi.randomUUID();
	const bytes = new Uint8Array(16);
	if (typeof cryptoApi?.getRandomValues === "function") {
		cryptoApi.getRandomValues(bytes);
	} else {
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = Math.floor(Math.random() * 256);
		}
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The segment each item of an array is addressed by in a value path
 * (ADR-0023): its `_id` when it is an object holding a well-formed one no
 * earlier item holds, and its index otherwise — a row without an id, or the
 * repeat of one, still needs a place. The Go module's `itemSegments` gives
 * the same answers.
 */
export function itemSegments(items: readonly unknown[]): string[] {
	const seen = new Set<string>();
	return items.map((item, index) => {
		const id = isPlainObject(item) ? item._id : undefined;
		if (isRowId(id) && !seen.has(id)) {
			seen.add(id);
			return id;
		}
		return String(index);
	});
}

/**
 * Maps a Zod issue path — indices into arrays — onto the value path grammar
 * (ADR-0023): `/`-separated, each array item as its `_id` where
 * {@link itemSegments} gives one, escaped as in RFC 6901. `data` is the value
 * the path walks, from its root.
 *
 * `toIdPath({ authors: [{ _id: "a1" }] }, ["authors", 0, "name"])` is
 * `/authors/a1/name`.
 */
export function toIdPath(
	data: unknown,
	path: readonly (string | number)[],
	cache?: WeakMap<readonly unknown[], string[]>,
): string {
	const segments: (string | number)[] = [];
	let node = data;
	for (const segment of path) {
		if (Array.isArray(node) && typeof segment === "number") {
			let ids = cache?.get(node);
			if (!ids) {
				ids = itemSegments(node);
				cache?.set(node, ids);
			}
			segments.push(ids[segment] ?? segment);
		} else {
			segments.push(segment);
		}
		node =
			node !== null && typeof node === "object"
				? (node as Record<string | number, unknown>)[segment]
				: undefined;
	}
	return toPath(segments);
}

/**
 * The row array's Zod type, with `duplicate_id` on top: an array whose items'
 * `_id`s must be unique. Checked on the raw input whatever else a row gets
 * wrong, which a `superRefine` would not do — Zod skips a refinement once an
 * item fails — so a duplicate is reported beside a row's other errors, as Go
 * reports it. Each repeat is one issue at its row, `params.code`
 * `"duplicate_id"`.
 *
 * Subclassed rather than refined for the same reason the canonical object is
 * (`zod-builder.ts`): it stays a `ZodArray`, `.element` and all. Apply
 * `.min()`/`.max()` first — a `ZodArray` method hands back a plain one.
 */
export class RowZodArray<T extends ZodTypeAny> extends ZodArray<T> {
	static of<T extends ZodTypeAny>(array: ZodArray<T>): RowZodArray<T> {
		return new RowZodArray(array._def);
	}

	override _parse(input: ParseInput) {
		const result = super._parse(input);
		const { ctx } = this._processInputParams(input);
		if (!Array.isArray(ctx.data)) return result;
		const seen = new Set<string>();
		let duplicates = false;
		ctx.data.forEach((row: unknown, index: number) => {
			const id = isPlainObject(row) ? row._id : undefined;
			if (!isRowId(id)) return;
			if (seen.has(id)) {
				duplicates = true;
				addIssueToContext(ctx, {
					code: z.ZodIssueCode.custom,
					path: [index],
					message: "Duplicate _id",
					params: { code: "duplicate_id" },
				});
				return;
			}
			seen.add(id);
		});
		if (!duplicates) return result;
		// A duplicate fails the parse: a result that was valid becomes dirty.
		const dirty = <R extends { status: string }>(r: R): R =>
			r.status === "valid" ? { ...r, status: "dirty" } : r;
		return result instanceof Promise ? result.then(dirty) : dirty(result);
	}
}

/**
 * The context minting runs in: every row of a value is reached through the
 * types' own `mintIds`, a container reaching its children through
 * `mintChildren`, so shared code never learns a type's name (ADR-0007).
 *
 * `fresh: false` — loading: a row keeps a well-formed `_id` no earlier row of
 * its array holds, and gets a new one otherwise. `fresh: true` — paste and
 * duplicate: every `_id` is new, nested rows' too.
 *
 * Unchanged values keep their identity, so a caller can tell nothing was
 * minted by `===`.
 */
function mintContext(
	pluginMap: ReadonlyMap<string, FieldTypePlugin>,
	fresh: boolean,
): MintIdsContext {
	const context: MintIdsContext = {
		fresh,
		mintChildren: (children, record) =>
			mintRecord(children, record, pluginMap, context),
	};
	return context;
}

function mintRecord(
	fields: readonly Field[],
	record: unknown,
	pluginMap: ReadonlyMap<string, FieldTypePlugin>,
	context: MintIdsContext,
): unknown {
	if (!isPlainObject(record)) return record;
	let next: Record<string, unknown> | undefined;
	for (const field of fields) {
		if (!fieldProducesValue(field)) continue;
		const mint = pluginMap.get(field.field_type)?.mintIds;
		if (!mint) continue;
		const accessor = field.config.api_accessor;
		const value = record[accessor];
		if (value === undefined) continue;
		const minted = mint(field as Field<unknown>, value, context);
		if (minted === value) continue;
		next ??= { ...record };
		next[accessor] = minted;
	}
	return next ?? record;
}

function toPluginMap(
	plugins:
		| readonly FieldTypePlugin[]
		| ReadonlyMap<string, FieldTypePlugin<unknown>>,
): ReadonlyMap<string, FieldTypePlugin> {
	return Array.isArray(plugins)
		? new Map((plugins as readonly FieldTypePlugin[]).map((p) => [p.id, p]))
		: (plugins as ReadonlyMap<string, FieldTypePlugin>);
}

/**
 * Stored data with an `_id` minted into every row missing a well-formed one,
 * or repeating one an earlier row of its array holds (ADR-0023) — what a form
 * does to a value loaded without ids, so that its rows validate and are
 * stored with ids on the next save. SpecForm, EditDrawer and SpecDataTable
 * all normalise through this.
 *
 * Data that needs no id is returned as it is — the same object.
 */
export function mintMissingIds<T>(
	spec: readonly Field[],
	data: T,
	plugins:
		| readonly FieldTypePlugin[]
		| ReadonlyMap<string, FieldTypePlugin<unknown>>,
): T {
	const pluginMap = toPluginMap(plugins);
	return mintRecord(spec, data, pluginMap, mintContext(pluginMap, false)) as T;
}

/**
 * A copy of rows of `field` for paste and duplicate: each gets a new `_id`,
 * and so does every row nested inside it — a copy never shares an id with
 * what it was copied from (ADR-0023).
 */
export function copyRows(
	field: Field,
	rows: readonly unknown[],
	plugins:
		| readonly FieldTypePlugin[]
		| ReadonlyMap<string, FieldTypePlugin<unknown>>,
): unknown[] {
	const pluginMap = toPluginMap(plugins);
	const mint = pluginMap.get(field.field_type)?.mintIds;
	const copied = structuredClone(rows) as unknown[];
	if (!mint) return copied;
	return mint(
		field as Field<unknown>,
		copied,
		mintContext(pluginMap, true),
	) as unknown[];
}

/**
 * The `mintIds` of a row container: each row's `_id` ensured as
 * `context.fresh` says, and each row's own Fields — `fieldsOf(row)`, if any —
 * minted into through `context`. Used by `group`, `virtual_table` and
 * `blocks`; a value that is not an array, or a row that is not an object, is
 * left as it is for validation to report.
 */
export function mintRowIds(
	value: unknown,
	context: MintIdsContext,
	fieldsOf: (row: Record<string, unknown>) => Field[] | undefined,
): unknown {
	if (!Array.isArray(value)) return value;
	const seen = new Set<string>();
	let changed = false;
	const rows = value.map((row: unknown) => {
		if (!isPlainObject(row)) return row;
		let next: Record<string, unknown> = row;
		const fields = fieldsOf(row);
		if (fields) {
			next = context.mintChildren(fields, row) as Record<string, unknown>;
		}
		const id = next._id;
		if (context.fresh || !isRowId(id) || seen.has(id)) {
			next = { ...next, _id: mintId() };
		}
		seen.add(next._id as string);
		if (next !== row) changed = true;
		return next;
	});
	return changed ? rows : value;
}
