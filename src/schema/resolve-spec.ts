// src/schema/resolve-spec.ts
import { isFieldShaped } from "./block-types";
import { BLUEPRINT_PIN, pinnedRelease } from "./blueprint-link";
import { CATALOGUE_VERSION } from "./catalogue-version";
import { builtInFieldTypes } from "./field-types";
import type { FieldTypePlugin } from "./plugin";
import type { Field, Schema } from "./types";
import { toPath } from "./validate-settings";

/** The one adapter capability resolution needs for a Blueprint Pin: a
 * **Blueprint Release id** in, that Release's Fields out (ADR-0020).
 * `FieldKitAdapters["blueprint"]` is built on this interface, so a Consumer
 * passes the same adapters object it already gives `FieldKitProvider`.
 *
 * The argument is whatever a Fieldset's or a linked Virtual Table's
 * `blueprint` setting holds — a Release id, never a Blueprint id, a Revision
 * or "latest". Returning an already-resolved Release's Fields is fine: Fields
 * that have `children` are left alone. */
export interface BlueprintSchemaAdapter {
	getSchema: (releaseId: string) => Promise<Field[]>;
}

/**
 * One Blueprint Release as an Author picks it: the Release id a Fieldset
 * stores, and the name they recognise it by. Deliberately thinner than a
 * Blueprint — nothing here needs its Fields, and asking for them would make
 * listing as expensive as resolving. Extra keys pass through, so a Consumer
 * can carry its own (the Blueprint it releases, its version label).
 *
 * Resolution never reads it; it lives beside `BlueprintSchemaAdapter` because
 * it is the same vocabulary — what fieldkit asks a Consumer for about
 * Blueprints — and a Consumer typing their adapter from `/schema` can reach
 * both. The capability that returns these is the optional
 * `list()` on `FieldKitAdapters["blueprint"]` (#52).
 */
export interface BlueprintSummary {
	/** The Release id a Pin stores (ADR-0020). */
	id: string;
	name: string;
	[key: string]: unknown;
}

/** Fetches the opaque part a Pin of one kind names — a Text Type, a
 * Typesetting Instruction Set — by its Release id. What it returns is stored
 * in the Resolved Spec's `parts` unread. */
export type PartFetcher = (releaseId: string) => Promise<unknown>;

export interface ResolveSpecAdapters {
	blueprint?: BlueprintSchemaAdapter;
	/**
	 * A fetcher per opaque kind of Pin, keyed by the kind the Catalogue
	 * records for it. A Pin whose kind has none is left unresolved — as a
	 * Blueprint Pin is without `blueprint` — and its part is not in `parts`.
	 * No built-in type pins an opaque part yet.
	 */
	parts?: Record<string, PartFetcher>;
}

/** One Pin a Spec holds: the fixed Release a setting names, and of what
 * kind (ADR-0020). The same shape as Go's `Pin`. */
export interface SpecPin {
	/** The setting holding it: `/address/settings/blueprint`. */
	path: string;
	/** What the Release is of, as the Catalogue records it: `blueprint`, or
	 * the kind of an opaque part. */
	kind: string;
	/** The Release's id, opaque to fieldkit. */
	release: string;
}

/**
 * A Spec whose every Pin is resolved (ADR-0020), in the envelope Go's
 * `ResolvedSpec` shares.
 */
export interface ResolvedSpec {
	/** The Catalogue version it was resolved against. */
	catalogue: string;
	/** The knkeditor vocabulary version its rich text needs; `""` while it
	 * pins no rich-text part, which no built-in type does yet. */
	vocabulary: string;
	/** The Spec, each pinned Blueprint Release inlined as the pinning Field's
	 * `children`. The Field keeps its Pin. What a renderer, a Schema and a
	 * table take. */
	fields: Schema;
	/** The opaque parts it pins, each stored once, by kind and then Release
	 * id. The Field keeps its Pin. */
	parts: Record<string, Record<string, unknown>>;
}

/** The caps `resolveSpec()` applies unless a caller sets its own — Go's
 * `DefaultMaxFetches` and `DefaultMaxDepth`. */
export const RESOLVE_CAPS = {
	/** Distinct Releases one resolution fetches at most. */
	maxFetches: 256,
	/** How deeply Pins may nest: a Pin in the Spec is at depth 1, a Pin in a
	 * Release it pins at depth 2. */
	maxDepth: 8,
} as const;

export interface ResolveSpecOptions {
	/** The Field Types whose Catalogue `pins` say which settings hold a Pin.
	 * Defaults to the built-in ones. */
	plugins?: Map<string, FieldTypePlugin> | readonly FieldTypePlugin[];
	maxFetches?: number;
	maxDepth?: number;
}

/** Why resolution failed — the codes Go's `ResolveError` reports. */
export type ResolveSpecErrorCode =
	| "resolve_cycle"
	| "resolve_too_many_fetches"
	| "resolve_too_deep"
	| "resolve_fetch_failed"
	| "resolve_invalid_release";

/** What `resolveSpec()` rejects with: a code from the data contract and the
 * Pin it failed at. An adapter's own rejection is its `cause`. */
export class ResolveSpecError extends Error {
	readonly code: ResolveSpecErrorCode;
	/** The Pin being resolved. Its `path` runs through the Releases inlined
	 * above it: `/a/children/b/settings/blueprint`. */
	readonly pin: SpecPin;

	constructor(code: ResolveSpecErrorCode, pin: SpecPin, cause?: unknown) {
		super(
			`${pin.path}: ${code} (${pin.kind} "${pin.release}")${
				cause instanceof Error ? `: ${cause.message}` : ""
			}`,
			{ cause },
		);
		this.name = "ResolveSpecError";
		this.code = code;
		this.pin = pin;
	}
}

type Segments = readonly (string | number)[];

type PluginMap = Map<string, FieldTypePlugin>;

function pluginMap(plugins: ResolveSpecOptions["plugins"]): PluginMap {
	if (plugins instanceof Map) return plugins;
	return new Map(
		(plugins ?? builtInFieldTypes).map((plugin) => [plugin.id, plugin]),
	);
}

/** Each Pin a Field holds itself, as the Catalogue records its type's. */
function fieldPins(
	field: Field,
	segments: Segments,
	plugins: PluginMap,
): SpecPin[] {
	const pins: SpecPin[] = [];
	for (const { key, kind } of plugins.get(field.field_type)?.catalogue?.pins ??
		[]) {
		const release = pinnedRelease(field, key);
		if (release) {
			pins.push({
				path: toPath([...segments, "settings", key]),
				kind,
				release,
			});
		}
	}
	return pins;
}

/**
 * Every Pin a Spec holds, in document order: each setting a type's Catalogue
 * entry records as a Pin that names a Release. Walks every Spec a Field
 * holds, as `validateSpec()` does — `children`, a Block Type's Fields, a
 * Reference Spec — but fetches nothing, so the Pins inside a pinned Release
 * are that Release's own. The same answer as Go's `Pins`.
 */
export function specPins(
	spec: Schema,
	plugins?: ResolveSpecOptions["plugins"],
): SpecPin[] {
	const map = pluginMap(plugins);
	const pins: SpecPin[] = [];
	const walk = (fields: Field[], list: Segments) => {
		for (const field of fields) {
			const segments = [...list, field.config.api_accessor];
			pins.push(...fieldPins(field, segments, map));
			if (field.children?.length)
				walk(field.children, [...segments, "children"]);
			for (const held of map.get(field.field_type)?.heldSpecs?.(field) ?? []) {
				walk(held.fields, [...segments, ...held.segments]);
			}
		}
	};
	walk(spec, []);
	return pins;
}

/**
 * Resolves every Pin in a Spec (ADR-0020, ADR-0004) into a Resolved Spec —
 * the envelope Go's `Resolve` returns, `{ catalogue, vocabulary, fields,
 * parts }`. Which settings hold a Pin, and of what kind, is each type's
 * Catalogue entry (`catalogue.pins`), so a Consumer's own type that pins is
 * resolved too once it declares so.
 *
 * - A **Blueprint** Pin — a Fieldset's (ADR-0003), a linked Virtual Table's
 *   (ADR-0017) — is fetched through `adapters.blueprint.getSchema(releaseId)`
 *   and inlined as the Field's `children`, and the Pins inside it are
 *   resolved in turn. Only a Resolved Spec can produce a complete Schema, so
 *   this is the step between loading a Spec and building its Zod schema: hand
 *   `resolved.fields` to the renderer, the table and `specToZodSchema()`.
 * - Any other Pin names an **opaque part**, fetched through
 *   `adapters.parts[kind]` and stored once in `parts`.
 * - Each Release is fetched once per call, however many Fields pin it.
 *
 * Every Spec a Field holds is walked: `children` whatever holds them, and the
 * Specs a type holds in its settings (`heldSpecs` — a Block Type's Fields, a
 * Reference Spec), as `validateSpec()` walks them. A resolved list is written
 * back where it was found.
 *
 * Safe to call unconditionally: a Spec with nothing to resolve comes back as
 * the same `fields` array, so a memoised renderer sees no new identity, and a
 * Consumer never has to know which Field types need fetching. A Pin with no
 * adapter for its kind is left unresolved — a Fieldset without one renders its
 * "adapter not configured" stub.
 *
 * `children` is what "already resolved" means, the same signal the renderer
 * reads: a Field that has them — resolved, even to none, or a Virtual Table's
 * embedded Row Spec — fetches nothing, so resolving a Resolved Spec's Fields
 * fetches no Blueprint again. An authored Fieldset never carries children
 * (ADR-0003), so a Consumer who repoints one at another Release drops them
 * with it.
 *
 * @throws ResolveSpecError — `resolve_cycle` for a Release that pins,
 * however indirectly, itself; `resolve_too_many_fetches` and
 * `resolve_too_deep` past the caps (`RESOLVE_CAPS`, or the options);
 * `resolve_fetch_failed` wrapping an adapter's rejection, which is never
 * swallowed into empty children; `resolve_invalid_release` for a Blueprint
 * Release that is not a list of Fields.
 */
export async function resolveSpec(
	spec: Schema,
	adapters: ResolveSpecAdapters,
	options: ResolveSpecOptions = {},
): Promise<ResolvedSpec> {
	const resolver = new Resolver(adapters, options);
	const fields = await resolver.fields(spec, [], []);
	return {
		catalogue: CATALOGUE_VERSION,
		vocabulary: "",
		fields,
		parts: resolver.parts,
	};
}

/**
 * Whether `resolveSpec` would fetch anything for this Spec — true only when
 * some Pin in it is unresolved and there is an adapter for its kind: a
 * Blueprint Pin on a Field with no `children` yet, or an opaque part.
 *
 * For a caller that renders synchronously and only wants to wait when there is
 * something to wait for: a Spec with no Pins, an already-Resolved Spec, or a
 * Consumer with no adapter all answer false, and awaiting them would buy a
 * loading state nobody needs to see. Never a substitute for `resolveSpec` —
 * resolve on true, render as-is on false.
 *
 * Internal to fieldkit, deliberately: the question only arises when the Spec is
 * already in hand and the render is synchronous, which is the editor's Preview
 * and not the shape of a Consumer that fetches its Spec (and so already has a
 * loading state to await `resolveSpec` in). Export it from `/schema` when one
 * actually asks — that direction is cheap, the other is a breaking change.
 *
 * Walks exactly what `resolveSpec` walks, by the same rule (`children`
 * presence), so the two cannot disagree about what is left to do.
 */
export function specNeedsResolution(
	spec: Schema,
	adapters: ResolveSpecAdapters,
	plugins?: ResolveSpecOptions["plugins"],
): boolean {
	if (!adapters.blueprint && !adapters.parts) return false;
	const map = pluginMap(plugins);
	const needs = (field: Field): boolean => {
		const catalogue = map.get(field.field_type)?.catalogue;
		for (const { key, kind } of catalogue?.pins ?? []) {
			if (!pinnedRelease(field, key)) continue;
			if (kind === BLUEPRINT_PIN.kind) {
				if (field.children == null && adapters.blueprint) return true;
			} else if (adapters.parts?.[kind]) {
				return true;
			}
		}
		if (field.children?.some(needs)) return true;
		return (map.get(field.field_type)?.heldSpecs?.(field) ?? []).some((held) =>
			held.fields.some(needs),
		);
	};
	return spec.some(needs);
}

/** One resolution: the Releases fetched so far, and the parts collected. */
class Resolver {
	readonly parts: Record<string, Record<string, unknown>> = {};
	private readonly plugins: PluginMap;
	private readonly maxFetches: number;
	private readonly maxDepth: number;
	/** One promise per Release, shared by every Pin naming it — including the
	 * ones still in flight. A rejection is shared too, so a failing Release
	 * fails every Pin naming it rather than being retried per occurrence. */
	private readonly fetched = new Map<string, Promise<unknown>>();

	constructor(
		private readonly adapters: ResolveSpecAdapters,
		options: ResolveSpecOptions,
	) {
		this.plugins = pluginMap(options.plugins);
		this.maxFetches = options.maxFetches ?? RESOLVE_CAPS.maxFetches;
		this.maxDepth = options.maxDepth ?? RESOLVE_CAPS.maxDepth;
	}

	/** Resolves one list of Fields inside the Releases in `chain`, keeping the
	 * original array when no Field in it changed — that is what makes a
	 * Pin-free Spec come back identical. */
	async fields(
		fields: Field[],
		list: Segments,
		chain: readonly string[],
	): Promise<Field[]> {
		// A level at a time: sibling Pins resolve concurrently rather than one
		// round-trip after another.
		const resolved = await Promise.all(
			fields.map((field) =>
				this.field(field, [...list, field.config.api_accessor], chain),
			),
		);
		return resolved.some((field, index) => field !== fields[index])
			? resolved
			: fields;
	}

	private async field(
		field: Field,
		segments: Segments,
		chain: readonly string[],
	): Promise<Field> {
		let next = field;
		let inlined = false;
		for (const pin of fieldPins(field, segments, this.plugins)) {
			if (pin.kind !== BLUEPRINT_PIN.kind) {
				const fetchPart = this.adapters.parts?.[pin.kind];
				if (!fetchPart) continue;
				const part = await this.fetch(pin, chain, () => fetchPart(pin.release));
				this.parts[pin.kind] ??= {};
				this.parts[pin.kind][pin.release] = part;
				continue;
			}
			// Children present is resolved already, or an embedded Row Spec
			// (ADR-0017): nothing to fetch. An unresolved Pin without an
			// adapter is not an error — the renderer says so, and the rest of
			// the form still works.
			const blueprint = this.adapters.blueprint;
			if (field.children != null || !blueprint) continue;
			const release = await this.fetch(pin, chain, async () => {
				const fields = await blueprint.getSchema(pin.release);
				if (!Array.isArray(fields) || !fields.every(isFieldShaped)) {
					throw new ResolveSpecError("resolve_invalid_release", pin);
				}
				return fields;
			});
			const children = await this.fields(
				release as Field[],
				[...segments, "children"],
				[...chain, pinKey(pin)],
			);
			next = { ...next, children };
			inlined = true;
		}

		// Children not fetched here sit inside the same Releases this Field
		// does: a Group's rows, a resolved Fieldset's Fields, an embedded Row
		// Spec.
		if (!inlined && next.children?.length) {
			const children = await this.fields(
				next.children,
				[...segments, "children"],
				chain,
			);
			if (children !== next.children) next = { ...next, children };
		}

		for (const held of this.plugins.get(next.field_type)?.heldSpecs?.(next) ??
			[]) {
			const fields = await this.fields(
				held.fields,
				[...segments, ...held.segments],
				chain,
			);
			if (fields !== held.fields) next = setAt(next, held.segments, fields);
		}
		return next;
	}

	/** The Release a Pin names, fetched at most once per resolution, after
	 * refusing a cycle, a Pin too deep and a fetch too many. */
	private fetch(
		pin: SpecPin,
		chain: readonly string[],
		load: () => Promise<unknown>,
	): Promise<unknown> {
		const key = pinKey(pin);
		if (chain.includes(key)) {
			return Promise.reject(new ResolveSpecError("resolve_cycle", pin));
		}
		if (chain.length + 1 > this.maxDepth) {
			return Promise.reject(new ResolveSpecError("resolve_too_deep", pin));
		}
		const cached = this.fetched.get(key);
		if (cached) return cached;
		if (this.fetched.size >= this.maxFetches) {
			return Promise.reject(
				new ResolveSpecError("resolve_too_many_fetches", pin),
			);
		}
		const pending = (async () => {
			try {
				return await load();
			} catch (error) {
				if (error instanceof ResolveSpecError) throw error;
				throw new ResolveSpecError("resolve_fetch_failed", pin, error);
			}
		})();
		this.fetched.set(key, pending);
		return pending;
	}
}

/** A Release: a Pin without the place that holds it. */
function pinKey(pin: SpecPin): string {
	return JSON.stringify([pin.kind, pin.release]);
}

/** `field` with the value at `segments` replaced, copying only the path to
 * it. */
function setAt(field: Field, segments: Segments, value: unknown): Field {
	const set = (target: unknown, at: number): unknown => {
		if (at === segments.length) return value;
		const segment = segments[at];
		if (Array.isArray(target)) {
			const copy = [...target];
			copy[segment as number] = set(target[segment as number], at + 1);
			return copy;
		}
		const object = (target ?? {}) as Record<string, unknown>;
		return { ...object, [segment]: set(object[segment], at + 1) };
	};
	return set(field, 0) as Field;
}
