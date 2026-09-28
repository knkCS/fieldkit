// src/schema/reference-plugin.ts
//
// The parts `reference` and `single_reference` share — and every
// reference-shaped type `createReferencePlugin` mints: the settings both
// declare, the Reference Spec they hold, how a stored node is normalised and
// minted, the edges it yields and the record its values are. One node reads
// the same way whichever type holds it; only the tree differs.

import {
	addIssueToContext,
	type ParseInput,
	ZodArray,
	type ZodTypeAny,
	z,
} from "zod";
import type {
	ComposeChildrenSchema,
	HeldRecord,
	HeldSpec,
	MintIdsContext,
	SettingsRuleError,
	ValueContext,
	ValueEdge,
} from "./plugin";
import {
	linksReferenceSpec,
	normalizeReference,
	type PinMode,
	type ReferenceSpecSettings,
	type ReferenceValuesSchema,
	referenceIdMinter,
	referenceSpecFor,
} from "./reference";
import { referenceValuesZodType } from "./reference-spec";
import { isRowId, itemSegments } from "./row-ids";
import type { Field } from "./types";
import { isPlainObject } from "./unset";

/** The Content Graph edge kind a Reference yields (contenthub ADR 0009). Go's
 * `EdgeReference`. */
export const REFERENCE_EDGE_KIND = "reference";

/**
 * The Pin a reference-shaped type declares in the Catalogue: each
 * `blueprints` entry's `spec_blueprint` names a Blueprint Release (ADR-0020).
 * `*` stands for every item of a list, so a Pin key is a settings path — the
 * grammar `pinnedReleases` reads, and Go's `pinReleases`.
 */
export const REFERENCE_SPEC_PIN = {
	key: "blueprints/*/spec_blueprint",
	kind: "blueprint",
} as const;

/** One `blueprints` entry, as the settings schema holds it: `spec` is the
 * linked Reference Spec once resolved, and only then. */
const referenceBlueprintSchema = z
	.object({
		blueprint: z.string(),
		spec_blueprint: z.string().optional(),
		spec: z.array(z.unknown()).optional(),
	})
	.strict();

/**
 * The settings every reference-shaped type declares (ADR-0008, amended):
 * `blueprints` with their optional linked Reference Spec, the embedded
 * Reference Spec, and `pin_mode` — `none` or `release`, the `version` mode
 * gone. A Spec is not a settings value: the schema only says `spec` is a list,
 * and `validateSpec()` walks it as Fields in `reference_spec` Position.
 */
export const referenceSpecSettingsShape = {
	blueprints: z.array(referenceBlueprintSchema).optional(),
	spec: z.array(z.unknown()).optional(),
	pin_mode: z.enum(["none", "release"]).optional(),
};

/** Enough of a Field for a walk not to trip: an object with a `config`
 * object. */
function isFieldShaped(value: unknown): boolean {
	return isPlainObject(value) && isPlainObject(value.config);
}

/** A list of Fields held in settings, read leniently: `undefined` when it is
 * Unset or not a list; `"invalid"` when it is a list but not of Fields. */
function heldList(value: unknown): Field[] | "invalid" | undefined {
	if (!Array.isArray(value) || value.length === 0) return undefined;
	return value.every(isFieldShaped) ? (value as Field[]) : "invalid";
}

/** The `blueprints` entries as stored, each with its index. */
function blueprintEntries(
	settings: unknown,
): { entry: Record<string, unknown>; index: number }[] {
	const entries = isPlainObject(settings) ? settings.blueprints : undefined;
	if (!Array.isArray(entries)) return [];
	return entries.flatMap((entry, index) =>
		isPlainObject(entry) ? [{ entry, index }] : [],
	);
}

/** Whether a string names something: not blank. */
function named(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

/**
 * The Reference Specs a Field holds in settings, for `validateSpec()`,
 * `resolveSpec()` and `specPins()`: the embedded `spec`, and each entry's
 * linked one once resolved — all in `reference_spec` Position (ADR-0022).
 */
export function referenceHeldSpecs(field: Field): HeldSpec[] {
	const held: HeldSpec[] = [];
	const embedded = heldList(
		isPlainObject(field.settings) ? field.settings.spec : undefined,
	);
	if (Array.isArray(embedded)) {
		held.push({
			segments: ["settings", "spec"],
			fields: embedded,
			position: "reference_spec",
		});
	}
	for (const { entry, index } of blueprintEntries(field.settings)) {
		const linked = heldList(entry.spec);
		if (Array.isArray(linked)) {
			held.push({
				segments: ["settings", "blueprints", index, "spec"],
				fields: linked,
				position: "reference_spec",
			});
		}
	}
	return held;
}

/**
 * The rules across a reference-shaped Field's settings that its schema cannot
 * state (Go's `referenceSettings` and `referenceSpecs`):
 *
 * - two `blueprints` entries naming one Blueprint would give its References
 *   two Reference Specs — `duplicate_blueprint` at each repeat;
 * - an entry's `spec` is the linked Reference Spec a resolution inlined, so
 *   one without a `spec_blueprint` links nothing — `invalid_setting`;
 * - a Reference Spec that is a list but not of Fields cannot be walked —
 *   `invalid_setting` at the list.
 */
export function referenceSettingsRules(field: Field): SettingsRuleError[] {
	const errors: SettingsRuleError[] = [];
	const settings = field.settings;
	if (
		heldList(isPlainObject(settings) ? settings.spec : undefined) === "invalid"
	) {
		errors.push({
			segments: ["settings", "spec"],
			code: "invalid_setting",
			message: "The Reference Spec is not a list of Fields",
		});
	}
	const seen = new Set<string>();
	for (const { entry, index } of blueprintEntries(settings)) {
		const at = ["settings", "blueprints", index] as const;
		if (named(entry.blueprint)) {
			if (seen.has(entry.blueprint)) {
				errors.push({
					segments: [...at, "blueprint"],
					code: "duplicate_blueprint",
					message: `Blueprint "${entry.blueprint}" is listed twice`,
				});
			} else {
				seen.add(entry.blueprint);
			}
		}
		const linked = heldList(entry.spec);
		if (linked === undefined) continue;
		if (!named(entry.spec_blueprint) || linked === "invalid") {
			errors.push({
				segments: [...at, "spec"],
				code: "invalid_setting",
				message: named(entry.spec_blueprint)
					? "The linked Reference Spec is not a list of Fields"
					: "A Reference Spec in a blueprints entry needs its spec_blueprint",
			});
		}
	}
	return errors;
}

/**
 * The schema of one Reference's `values`, given the Field: its one Reference
 * Spec, or — for a Field that links a Reference Spec, when the context says
 * whose Blueprint each target is — chosen per Reference. Otherwise such a
 * Field's values are an opaque record: which Spec they follow is not known.
 */
export function referenceValuesSchema(
	settings: ReferenceSpecSettings | null | undefined,
	composeChildren?: ComposeChildrenSchema,
	context?: ValueContext,
): ReferenceValuesSchema {
	const targetBlueprint = context?.targetBlueprint;
	if (!linksReferenceSpec(settings) || !targetBlueprint) {
		return referenceValuesZodType(
			referenceSpecFor(settings, undefined),
			composeChildren,
		);
	}
	return (reference) =>
		referenceValuesZodType(
			referenceSpecFor(settings, targetBlueprint(reference.id)),
			composeChildren,
		);
}

/** The caps a Reference Tree's value obeys, from its Field's settings. */
export interface ReferenceTreeCaps {
	/** The Field's name, for the messages. */
	label: string;
	/** `max_items`: at most this many References at every level. */
	maxItems?: number;
	/** The deepest depth index a Reference may sit at, roots being 0. */
	depthCeiling?: number;
}

/** English for a count, so one Reference is not "1 references". */
function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

/**
 * A Reference Tree's array, with the rules that span the whole tree checked on
 * the raw input whatever else a node gets wrong — as Go checks them, and as
 * `RowZodArray` checks a row array's duplicates:
 *
 * - every `_id` unique across **every level** (ADR-0023): each repeat, in
 *   document order, is `duplicate_id` at the repeat;
 * - `max_items` over the whole tree — `too_many_items` at the Field;
 * - `max_depth` — each shallowest Reference past it, `invalid_value` at that
 *   Reference.
 *
 * Every array item counts at every level, a malformed one too: the caps are
 * about the value's size, not about its well-formed part.
 */
export class ReferenceTreeZodArray<T extends ZodTypeAny> extends ZodArray<T> {
	static with<T extends ZodTypeAny>(
		array: ZodArray<T>,
		caps: ReferenceTreeCaps,
	): ReferenceTreeZodArray<T> {
		const tree = new ReferenceTreeZodArray(array._def);
		tree.caps = caps;
		return tree;
	}

	caps: ReferenceTreeCaps = { label: "" };

	override _parse(input: ParseInput) {
		const result = super._parse(input);
		const { ctx } = this._processInputParams(input);
		if (!Array.isArray(ctx.data)) return result;
		const { label, maxItems, depthCeiling } = this.caps;
		let failed = false;
		const issue = (
			path: (string | number)[],
			code: string,
			message: string,
		) => {
			failed = true;
			addIssueToContext(ctx, {
				code: z.ZodIssueCode.custom,
				path,
				message,
				params: { code },
			});
		};

		const seen = new Set<string>();
		let count = 0;
		const walk = (
			nodes: unknown[],
			depth: number,
			prefix: (string | number)[],
			reportDepth: boolean,
		) => {
			nodes.forEach((node, index) => {
				count++;
				const path = [...prefix, index];
				let deeper = reportDepth;
				if (reportDepth && depthCeiling !== undefined && depth > depthCeiling) {
					issue(
						path,
						"invalid_value",
						`${label} nests at most ${plural(depthCeiling + 1, "level", "levels")} deep`,
					);
					// Only the shallowest offender in a branch: everything under it
					// is too deep because of it.
					deeper = false;
				}
				if (!isPlainObject(node)) return;
				const id = node._id;
				if (isRowId(id)) {
					if (seen.has(id)) issue(path, "duplicate_id", "Duplicate _id");
					else seen.add(id);
				}
				if (Array.isArray(node.children)) {
					walk(node.children, depth + 1, [...path, "children"], deeper);
				}
			});
		};
		walk(ctx.data, 0, [], true);

		if (maxItems !== undefined && count > maxItems) {
			issue(
				[],
				"too_many_items",
				`${label} holds at most ${plural(maxItems, "reference", "references")}`,
			);
		}
		if (!failed) return result;
		const dirty = <R extends { status: string }>(r: R): R =>
			r.status === "valid" ? { ...r, status: "dirty" } : r;
		return result instanceof Promise ? result.then(dirty) : dirty(result);
	}
}

/**
 * One stored node in the current shape with its `_id` ensured, and its
 * `values` minted into where its Reference Spec is known — then, for a tree,
 * its branch the same way, in document order so the first holder of an `_id`
 * keeps it.
 */
function mintNode(
	node: unknown,
	settings: ReferenceSpecSettings | null | undefined,
	pinMode: PinMode | undefined,
	ensureId: (id: unknown) => string | undefined,
	context: MintIdsContext,
	tree: boolean,
): unknown {
	const normalized = normalizeReference(node, pinMode, ensureId);
	if (!isPlainObject(normalized)) return normalized;
	let next: Record<string, unknown> = normalized;
	const spec = referenceSpecFor(settings, undefined);
	if (spec?.length && next.values !== undefined) {
		const values = context.mintChildren(spec, next.values);
		if (values !== next.values) next = { ...next, values };
	}
	if (tree && Array.isArray(next.children)) {
		const children = mintNodes(
			next.children,
			settings,
			pinMode,
			ensureId,
			context,
		);
		if (children !== next.children) next = { ...next, children };
	}
	return next;
}

function mintNodes(
	nodes: unknown[],
	settings: ReferenceSpecSettings | null | undefined,
	pinMode: PinMode | undefined,
	ensureId: (id: unknown) => string | undefined,
	context: MintIdsContext,
): unknown[] {
	let changed = false;
	const next = nodes.map((node) => {
		const minted = mintNode(node, settings, pinMode, ensureId, context, true);
		if (minted !== node) changed = true;
		return minted;
	});
	return changed ? next : nodes;
}

/**
 * The `mintIds` of a Reference Tree (ADR-0023): every node at every level
 * normalised from a legacy shape (`normalizeReference`) and given an `_id`
 * where it needs one — unique across the whole tree. The value itself when
 * nothing changed, so a loaded value already in shape keeps its identity.
 */
export function mintReferenceTree(
	field: Field<ReferenceSpecSettings>,
	value: unknown,
	context: MintIdsContext,
): unknown {
	if (!Array.isArray(value)) return value;
	return mintNodes(
		value,
		field.settings,
		field.settings?.pin_mode,
		referenceIdMinter(context.fresh),
		context,
	);
}

/** The `mintIds` of a Single Reference: its one node, as a tree's. */
export function mintSingleReference(
	field: Field<ReferenceSpecSettings>,
	value: unknown,
	context: MintIdsContext,
): unknown {
	return mintNode(
		value,
		field.settings,
		field.settings?.pin_mode,
		referenceIdMinter(context.fresh),
		context,
		false,
	);
}

/** Each node of a tree value with its path segments below the Field — its
 * `_id`, through `children` (ADR-0023) — in document order. Shared by every
 * tree-valued type (a Reference Tree, and the publishing package's trees);
 * Go's `EachTreeNode`. */
export function eachTreeNode(
	value: unknown,
	visit: (node: Record<string, unknown>, segments: string[]) => void,
): void {
	const walk = (nodes: unknown[], prefix: string[]) => {
		const segments = itemSegments(nodes);
		nodes.forEach((node, index) => {
			if (!isPlainObject(node)) return;
			const at = [...prefix, segments[index]];
			visit(node, at);
			if (Array.isArray(node.children)) {
				walk(node.children, [...at, "children"]);
			}
		});
	};
	if (Array.isArray(value)) walk(value, []);
}

/** The edge one node yields: its target, and its Pin. */
function nodeEdge(
	node: Record<string, unknown>,
	segments: string[],
): ValueEdge | undefined {
	if (!named(node.id)) return undefined;
	const target: ValueEdge["target"] = { content: node.id };
	if (named(node.pin)) target.pin = node.pin;
	return { kind: REFERENCE_EDGE_KIND, target, segments };
}

/** A Reference Tree's edges: one `reference` edge per node, at the node's
 * path, carrying its target and its Pin (Go's `referenceTreeEdges`). */
export function referenceTreeEdges(value: unknown): ValueEdge[] {
	const edges: ValueEdge[] = [];
	eachTreeNode(value, (node, segments) => {
		const edge = nodeEdge(node, segments);
		if (edge) edges.push(edge);
	});
	return edges;
}

/** A Single Reference's edge, at the Field itself. */
export function singleReferenceEdges(value: unknown): ValueEdge[] {
	if (!isPlainObject(value)) return [];
	const edge = nodeEdge(value, []);
	return edge ? [edge] : [];
}

/** The record one node's `values` are, against its Reference Spec — none
 * when the Spec is not known or empty. */
function nodeRecord(
	node: Record<string, unknown>,
	segments: string[],
	settings: ReferenceSpecSettings | null | undefined,
	context?: ValueContext,
): HeldRecord | undefined {
	if (!isPlainObject(node.values)) return undefined;
	const blueprint =
		typeof node.id === "string"
			? context?.targetBlueprint?.(node.id)
			: undefined;
	const fields = referenceSpecFor(settings, blueprint);
	if (!fields?.length) return undefined;
	return { fields, record: node.values, segments: [...segments, "values"] };
}

/** A Reference Tree's records: each node's `values` (Go's heldRecords). */
export function referenceTreeRecords(
	field: Field<ReferenceSpecSettings>,
	value: unknown,
	context?: ValueContext,
): HeldRecord[] {
	const records: HeldRecord[] = [];
	eachTreeNode(value, (node, segments) => {
		const record = nodeRecord(node, segments, field.settings, context);
		if (record) records.push(record);
	});
	return records;
}

/** A Single Reference's record: its node's `values`. */
export function singleReferenceRecords(
	field: Field<ReferenceSpecSettings>,
	value: unknown,
	context?: ValueContext,
): HeldRecord[] {
	if (!isPlainObject(value)) return [];
	const record = nodeRecord(value, [], field.settings, context);
	return record ? [record] : [];
}
