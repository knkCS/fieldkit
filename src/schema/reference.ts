// src/schema/reference.ts
import {
	addIssueToContext,
	type ParseInput,
	ZodObject,
	type ZodRawShape,
	type ZodTypeAny,
	z,
} from "zod";
import { isRowId, mintId, rowIdSchema } from "./row-ids";
import type { Field } from "./types";
import { isPlainObject } from "./unset";

/**
 * Whether a Reference Field fixes its References to a Release of their
 * target, or tracks the Release In Force.
 *
 * The setting lives on the Field, never on the value: a Reference's Pin is a
 * bare Release id, and this is the only thing that says the Field pins at all
 * (ADR-0008). A Pin names a Release and nothing else — the `version` mode
 * pinned a Revision, which no Pin may name, and is gone (ADR-0008, amended).
 * Changing the setting to `"none"` therefore invalidates every stored Pin at
 * once, and the renderer drops them when it loads the value.
 *
 * `"none"` is the absence of pinning, not a kind of target: a Field that does
 * not pin never asks for a target and never stores one.
 */
export type PinMode = "none" | "release";

/**
 * The modes that actually pin — only `"release"` now.
 *
 * The only ones `listPinTargets` is ever asked for, so an Adapter never has to
 * answer "what are the targets for not pinning".
 */
export type PinningMode = Exclude<PinMode, "none">;

/**
 * The value one node of a Reference Field holds (ADR-0008, amended).
 *
 * Fieldkit owns this shape; a Consumer maps it to whatever it persists. Rules
 * the shape encodes:
 *
 * - **Every node carries an `_id`** (ADR-0023) — unique within the Field's
 *   value across every level of the tree, and not the target's `id`, because
 *   one Content may be referenced twice. It is what Compare and Merge match
 *   nodes by.
 * - **The tree is genuinely nested.** `children` holds References, so an
 *   orphan is unrepresentable. Flat encodings with ancestor lists are the
 *   Consumer's business.
 * - **No label, no Blueprint id.** A display name is resolved through the
 *   reference Adapter on load, so a Content renamed elsewhere reads correctly
 *   here instead of going stale in saved data; which Blueprint the target is
 *   of is the target's own fact, not the pointing's.
 */
export interface Reference {
	/** The node's identity within the Field's value (ADR-0023). */
	_id: string;
	/** The referenced Content's id. */
	id: string;
	/**
	 * The Release of the target this Reference is pinned to, or absent for the
	 * Release In Force. Only a Field whose `pin_mode` is `"release"` stores one.
	 */
	pin?: string;
	/**
	 * The values of the Reference Spec's Fields — what the pointing says, not
	 * either Content — keyed by Accessor.
	 */
	values?: Record<string, unknown>;
	/** Nested References. The tree Reference type only; a Single Reference
	 * holds exactly one Reference and never a branch. */
	children?: Reference[];
}

/**
 * One entry of a Reference Field's `blueprints` setting: a Blueprint the
 * Field may point at, and — optionally — the Blueprint Release whose Fields
 * are the Reference Spec of every Reference to that Blueprint.
 *
 * A linked Reference Spec **replaces** the embedded `spec` for those
 * References; the two are never merged (ADR-0008, amended). `spec_blueprint`
 * is a Pin (ADR-0020), so resolving the Spec inlines that Release's Fields as
 * this entry's `spec` — the entry's `spec` present is what resolved means, as
 * a Fieldset's `children` are.
 */
export interface ReferenceBlueprint {
	/** The Blueprint's id, opaque to fieldkit. */
	blueprint: string;
	/** The Blueprint Release whose Fields are the Reference Spec for
	 * References to `blueprint`. */
	spec_blueprint?: string;
	/** The linked Reference Spec, inlined by `resolveSpec()`. Never authored:
	 * `validateSpec()` refuses it without a `spec_blueprint`. */
	spec?: Field[];
}

/** The settings every reference-shaped type shares: which Blueprints it may
 * point at, its Reference Spec, and whether it pins. */
export interface ReferenceSpecSettings {
	/** The Blueprints this Field may point at, each with an optional linked
	 * Reference Spec. Empty or absent means the Adapter decides — fieldkit has
	 * no notion of a Blueprint kind (ADR-0002). */
	blueprints?: ReferenceBlueprint[];
	/** The embedded Reference Spec: the Fields every Reference fills in,
	 * unless a linked one replaces it for the target's Blueprint. */
	spec?: Field[];
	/** Absent reads as `"none"`. */
	pin_mode?: PinMode;
}

/**
 * Who a Reference points at, for choosing its Reference Spec: the Blueprint of
 * a target Content by its id, or `undefined` when it is not known.
 *
 * A Reference's value carries no Blueprint id (ADR-0008, amended), so whoever
 * validates a value against a Field that links a Reference Spec has to say.
 * The Go module's `WithTargetBlueprints` is the same.
 */
export type TargetBlueprint = (contentId: string) => string | undefined;

/** The Blueprints a Field may point at, as ids — what a browse is
 * constrained to. Entries of the wrong shape are skipped. */
export function referenceBlueprintIds(
	settings: ReferenceSpecSettings | null | undefined,
): string[] {
	return referenceBlueprints(settings).map((entry) => entry.blueprint);
}

/** A Field's `blueprints` entries, read leniently: an entry that is not an
 * object naming a Blueprint is skipped. */
export function referenceBlueprints(
	settings: ReferenceSpecSettings | null | undefined,
): ReferenceBlueprint[] {
	const entries = settings?.blueprints;
	if (!Array.isArray(entries)) return [];
	return entries.filter(
		(entry): entry is ReferenceBlueprint =>
			isPlainObject(entry) &&
			typeof entry.blueprint === "string" &&
			entry.blueprint.trim() !== "",
	);
}

/** Whether an entry links a Reference Spec: its `spec_blueprint` names a
 * Release. A blank one is no link, as a blank Fieldset `blueprint` is none. */
function linksSpec(entry: ReferenceBlueprint): boolean {
	return (
		typeof entry.spec_blueprint === "string" &&
		entry.spec_blueprint.trim() !== ""
	);
}

/** Whether a Field links a Reference Spec for any Blueprint — whether the
 * Reference Spec of a Reference depends on its target. */
export function linksReferenceSpec(
	settings: ReferenceSpecSettings | null | undefined,
): boolean {
	return referenceBlueprints(settings).some(linksSpec);
}

/** The entries of a list that are Fields at all: an object with a `config`
 * object. Settings may have been written by hand, and a stray entry must cost
 * only itself. */
function fieldList(value: unknown): Field[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(entry): entry is Field =>
			isPlainObject(entry) && isPlainObject(entry.config),
	);
}

/**
 * The Reference Spec of a Reference whose target is of `blueprint` — exactly
 * one, as the glossary promises (ADR-0008, amended):
 *
 * - A Field that links no Reference Spec has only its embedded `spec`, for
 *   every target.
 * - Otherwise the entry for the target's Blueprint, when it links one,
 *   **replaces** the embedded `spec` — its resolved `spec`, never merged.
 * - A target of any other Blueprint has the embedded `spec`.
 *
 * `undefined` when it cannot be known: the Field links a Reference Spec and the
 * target's Blueprint is unknown, or the linked Spec is not resolved yet. A
 * Reference's values are then an opaque record. Go's `referenceSpecFor` gives
 * the same answers.
 */
export function referenceSpecFor(
	settings: ReferenceSpecSettings | null | undefined,
	blueprint: string | undefined,
): Field[] | undefined {
	const embedded = fieldList(settings?.spec);
	const entries = referenceBlueprints(settings);
	if (!entries.some(linksSpec)) return embedded;
	if (!blueprint) return undefined;
	const entry = entries.find(
		(candidate) => candidate.blueprint === blueprint && linksSpec(candidate),
	);
	if (!entry) return embedded;
	return Array.isArray(entry.spec) ? fieldList(entry.spec) : undefined;
}

/**
 * A Reference without its branch — `_id`, `id`, its Pin and its values.
 *
 * Unknown keys are stripped rather than rejected, which is how a `children`
 * array reaching a Single Reference is dropped instead of blocking submit.
 * The tree type extends this with a lazily-recursive `children`.
 */
export const referenceValueSchema = z.object({
	_id: rowIdSchema,
	id: z.string().min(1),
	pin: z.string().optional(),
	values: z.record(z.unknown()).optional(),
});

/**
 * The schema of one Reference's `values` for the Field, given the target's
 * Reference Spec — or, where the Reference Spec depends on the target, a
 * function choosing it per Reference.
 */
export type ReferenceValuesSchema =
	| ZodTypeAny
	| ((reference: { id: string }) => ZodTypeAny);

/**
 * One Reference of a tree, with `values` shaped by the Field's Reference Spec.
 *
 * Lazily recursive, because a Reference's `children` are References. The
 * recursion is what keeps a nested value intact through a parse — an object
 * schema that did not name `children` would *strip* it, so a drag would nest
 * a Reference on screen and submit a flat list. It is also what puts the
 * Reference Spec on every Reference at every level. How deep the nesting may go
 * is a Field setting, enforced in that Field's own Schema rather than here.
 *
 * A factory rather than a constant because the Reference Spec is a *setting*:
 * only the plugin holding it can compose it (ADR-0007), so the shape of
 * `values` has to arrive from outside. A function chooses it per Reference,
 * for a Field whose Reference Spec depends on the target's Blueprint.
 */
export function referenceTreeSchemaWith(
	values: ReferenceValuesSchema,
): z.ZodType<Reference> {
	const node: z.ZodType<Reference> = z.lazy(() =>
		referenceNodeSchema(values, z.array(node).optional()),
	);
	return node;
}

/** One Reference, `values` shaped by `values`, with `children` — the tree's
 * branch, or nothing for a Single Reference. */
export function referenceNodeSchema(
	values: ReferenceValuesSchema,
	children?: ZodTypeAny,
): z.ZodType<Reference> {
	const extra: Record<string, ZodTypeAny> = children ? { children } : {};
	if (typeof values !== "function") {
		return referenceValueSchema.extend({
			values,
			...extra,
		}) as unknown as z.ZodType<Reference>;
	}
	// The Reference Spec depends on the target: the node is parsed with its
	// `values` opaque, and its `values` then checked against the schema its
	// target chooses — on the raw node, whatever else the node gets wrong, as
	// Go checks it.
	const node = referenceValueSchema.extend({ values: z.unknown(), ...extra });
	return TargetValuesZodObject.of(
		node,
		values,
	) as unknown as z.ZodType<Reference>;
}

/**
 * One Reference whose `values` follow a Reference Spec chosen by its target.
 * A `ZodObject` subclass rather than a refinement or a transform, because Zod
 * skips both once any other key of the node — or any node of its branch —
 * fails, and a value's errors must not depend on its neighbours'.
 */
class TargetValuesZodObject<T extends ZodRawShape> extends ZodObject<T> {
	static of<T extends ZodRawShape>(
		object: ZodObject<T>,
		values: (reference: { id: string }) => ZodTypeAny,
	): TargetValuesZodObject<T> {
		const node = new TargetValuesZodObject(object._def);
		node.valuesOf = values;
		return node;
	}

	valuesOf: (reference: { id: string }) => ZodTypeAny = () => z.unknown();

	override _parse(input: ParseInput) {
		const result = super._parse(input);
		const { ctx } = this._processInputParams(input);
		const node = ctx.data;
		if (!isPlainObject(node) || typeof node.id !== "string" || !node.id) {
			return result;
		}
		const checked = this.valuesOf({ id: node.id }).safeParse(node.values);
		if (checked.success) return result;
		for (const issue of checked.error.issues) {
			addIssueToContext(ctx, { ...issue, path: ["values", ...issue.path] });
		}
		const dirty = <R extends { status: string }>(r: R): R =>
			r.status === "valid" ? { ...r, status: "dirty" } : r;
		return result instanceof Promise ? result.then(dirty) : dirty(result);
	}
}

/**
 * A Reference Tree that says nothing about its values — the opaque record
 * ADR-0008 declares, which is what a Field with no Reference Spec holds.
 */
export const referenceTreeSchema: z.ZodType<Reference> =
	referenceTreeSchemaWith(z.record(z.unknown()).optional());

/**
 * The Reference to store for one Content and one Pin.
 *
 * No Pin writes no `pin` key at all: an absent Pin already means the Release
 * In Force, and Unset is stored as absent (ADR-0021). Everything else the
 * Reference carries travels across untouched — it is the same Reference, only
 * its Pin changed — its `_id` included; a new Reference gets a fresh one
 * (ADR-0023).
 *
 * It lives here rather than in either control because it is a rule about the
 * value's shape, and both the tree Field and the Single Reference write Pins.
 */
export function withPin(
	previous: Reference | null | undefined,
	id: string,
	pin: string | null,
): Reference {
	const next: Reference = {
		...previous,
		_id: previous?._id ?? mintId(),
		id,
	};
	delete next.pin;
	if (pin) next.pin = pin;
	return next;
}

/**
 * Reads a form value as one Reference, or `null` when it isn't one.
 *
 * Form data arrives from a Consumer and is only as well-formed as whatever
 * produced it, so every place that renders a stored Reference — the table
 * cell, read mode — goes through this rather than trusting the cast. An `_id`
 * is not required to *read* one: a legacy value still reads as its target.
 */
export function asReference(value: unknown): Reference | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const { id } = value as Reference;
	return typeof id === "string" && id.length > 0 ? (value as Reference) : null;
}

/** What one stored node may carry beside its branch — everything else a
 * legacy value held (a label, a display name, a Blueprint id) is dropped. */
const REFERENCE_KEYS = new Set(["_id", "id", "pin", "values"]);

/**
 * One stored Reference in the current shape (ADR-0008, amended): what the
 * renderer does to a legacy value on load, so the form's defaults are already
 * what it saves and opening it does not make it dirty.
 *
 * - `attributes` becomes `values` (a `values` already there wins);
 * - a Pin is dropped unless the Field pins Releases — a `version` Pin, or any
 *   Pin under `pin_mode: "none"`, names nothing a Pin may;
 * - every key the shape does not hold — a label, a display name, a Blueprint
 *   id — is dropped;
 * - an `_id` is minted where `ensureId` says one is needed.
 *
 * Returns the node itself when nothing changed. A value that is not a
 * Reference is returned as it is, for validation to report.
 */
export function normalizeReference(
	node: unknown,
	pinMode: PinMode | undefined,
	ensureId: (id: unknown) => string | undefined,
): unknown {
	if (!isPlainObject(node)) return node;
	let next: Record<string, unknown> | undefined;
	const edit = () => {
		next ??= { ...node };
		return next;
	};
	if ("attributes" in node) {
		const target = edit();
		if (target.values === undefined && node.attributes !== undefined) {
			target.values = node.attributes;
		}
		delete target.attributes;
	}
	// An Unset Pin is stored as absent (ADR-0021), whatever the mode.
	if (
		"pin" in node &&
		(pinMode !== "release" || node.pin === null || node.pin === "")
	) {
		delete edit().pin;
	}
	for (const key of Object.keys(node)) {
		if (key === "attributes" || key === "children") continue;
		if (!REFERENCE_KEYS.has(key)) delete edit()[key];
	}
	const id = ensureId(node._id);
	if (id !== undefined) edit()._id = id;
	return next ?? node;
}

/**
 * The `_id` rule minting follows, across one whole Field value (ADR-0023):
 * loading keeps a well-formed `_id` no earlier node holds; `fresh` — paste and
 * duplicate — mints every one anew. Answers the id to write, or `undefined`
 * to keep the node's own.
 */
export function referenceIdMinter(
	fresh: boolean,
): (id: unknown) => string | undefined {
	const seen = new Set<string>();
	return (id) => {
		if (!fresh && isRowId(id) && !seen.has(id)) {
			seen.add(id);
			return undefined;
		}
		const minted = mintId();
		seen.add(minted);
		return minted;
	};
}
