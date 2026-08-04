// src/schema/resolve-spec.ts
// The fieldset plugin pulls in its React components, so its settings type is
// imported type-only — this module stays free of the renderer at runtime.
import type { FieldsetSettings } from "./field-types/fieldset";
import type { Field, Schema } from "./types";

/** The one adapter capability resolution needs: a Blueprint id in, that
 * Blueprint's Fields out. `FieldKitAdapters["blueprint"]` is built on this
 * interface, so a Consumer passes the same adapters object it already gives
 * `FieldKitProvider`. */
export interface BlueprintSchemaAdapter {
	getSchema: (blueprintId: string) => Promise<Field[]>;
}

/**
 * One Blueprint as an Author picks it: the id a Fieldset stores, and the name
 * they recognise it by. Deliberately thinner than a Blueprint — nothing here
 * needs its Fields, and asking for them would make listing as expensive as
 * resolving. Extra keys pass through, so a Consumer can carry its own.
 *
 * Resolution never reads it; it lives beside `BlueprintSchemaAdapter` because
 * it is the same vocabulary — what fieldkit asks a Consumer for about
 * Blueprints — and a Consumer typing their adapter from `/schema` can reach
 * both. The capability that returns these is the optional
 * `list()` on `FieldKitAdapters["blueprint"]` (#52).
 */
export interface BlueprintSummary {
	id: string;
	name: string;
	[key: string]: unknown;
}

export interface ResolveSpecAdapters {
	blueprint?: BlueprintSchemaAdapter;
}

/**
 * Expands every adapter-backed container in a Spec into a Resolved Spec —
 * today only `fieldset` (ADR-0003, ADR-0004).
 *
 * Each Fieldset's Blueprint is fetched through `adapters.blueprint.getSchema`
 * and attached as that Field's `children`, recursing into Fieldsets the
 * Blueprint itself embeds. Only a Resolved Spec can produce a complete Schema,
 * so this is the step a Consumer runs between loading a Spec and building its
 * Zod schema.
 *
 * Safe to call unconditionally: a Spec with nothing to resolve comes back
 * unchanged — the same array, so a memoised renderer sees no new identity —
 * and a Consumer never has to know which Field types need fetching.
 *
 * `children` is what "already resolved" means, the same signal the renderer
 * reads: a Fieldset that has them is left alone, so resolving a Resolved Spec
 * is a no-op that returns it by identity rather than fetching every Blueprint
 * again. An authored Fieldset never carries children (ADR-0003), so a
 * Consumer who repoints one at another Blueprint drops them with it.
 *
 * Not walked: Fields nested inside `settings` rather than `children` (a
 * block's `allowed_blocks[].fields`, an array's settings). That is the same
 * boundary `validateSpec` and `resolveMarkerConvention` draw, and the plugin
 * owning those settings composing them into a Schema does not move it — so a
 * Fieldset declared inside a block type is never resolved here. ADR-0007
 * states the boundary and what it costs.
 *
 * @throws if a Fieldset's Blueprint transitively embeds itself — the message
 * names the Blueprint chain — or, unchanged, whatever the adapter rejects
 * with. Adapter failures are never swallowed into empty children.
 */
export async function resolveSpec(
	spec: Schema,
	adapters: ResolveSpecAdapters,
): Promise<Schema> {
	const blueprint = adapters.blueprint;
	// Nothing can be fetched, so nothing can change. The Fieldsets stay
	// unresolved and render their "adapter not configured" stub.
	if (!blueprint) return spec;

	return resolveFields(spec, [], createFetcher(blueprint));
}

/**
 * Whether `resolveSpec` would fetch anything for this Spec — true only when
 * some Fieldset in it names a Blueprint, has no `children` yet, and there is
 * an adapter to fetch them with.
 *
 * For a caller that renders synchronously and only wants to wait when there is
 * something to wait for: a Spec with no Fieldsets, an already-Resolved Spec,
 * or a Consumer with no blueprint adapter all answer false, and awaiting them
 * would buy a loading state nobody needs to see. Never a substitute for
 * `resolveSpec` — resolve on true, render as-is on false.
 *
 * Internal to fieldkit, deliberately: the question only arises when the Spec is
 * already in hand and the render is synchronous, which is the editor's Preview
 * and not the shape of a Consumer that fetches its Spec (and so already has a
 * loading state to await `resolveSpec` in). Export it from `/schema` when one
 * actually asks — that direction is cheap, the other is a breaking change.
 *
 * Reads "resolved" by exactly the rule `resolveSpec` applies (`children`
 * presence, and no recursion past a resolved Fieldset), so the two cannot
 * disagree about what is left to do.
 */
export function specNeedsResolution(
	spec: Schema,
	adapters: ResolveSpecAdapters,
): boolean {
	if (!adapters.blueprint) return false;
	return spec.some(fieldNeedsResolution);
}

function fieldNeedsResolution(field: Field): boolean {
	if (field.field_type === "fieldset") {
		if (field.children != null) return false;
		return fieldsetBlueprintId(field) != null;
	}
	return field.children?.some(fieldNeedsResolution) ?? false;
}

/** The Blueprint a Fieldset names, or undefined for one an Author has not
 * pointed anywhere yet. The single place the settings cast lives, so the
 * predicate above and the resolver below cannot read a Fieldset differently. */
function fieldsetBlueprintId(field: Field): string | undefined {
	return (field.settings as FieldsetSettings | null | undefined)?.blueprint;
}

type Fetcher = (blueprintId: string) => Promise<Field[]>;

/** One fetch per Blueprint id per call, shared by every Fieldset naming it —
 * including the ones still in flight, since the promise is cached rather than
 * its result. A rejection is cached too, so a failing Blueprint fails every
 * Fieldset that names it instead of being retried per occurrence. */
function createFetcher(blueprint: BlueprintSchemaAdapter): Fetcher {
	const inFlight = new Map<string, Promise<Field[]>>();

	return (blueprintId) => {
		const cached = inFlight.get(blueprintId);
		if (cached) return cached;

		const pending = blueprint.getSchema(blueprintId);
		inFlight.set(blueprintId, pending);
		return pending;
	};
}

/** Resolves one list of Fields, keeping the original array when no Field in
 * it changed — that is what makes a Fieldset-free Spec come back identical. */
async function resolveFields(
	fields: Field[],
	chain: string[],
	fetch: Fetcher,
): Promise<Field[]> {
	// A level at a time: sibling Fieldsets resolve concurrently rather than
	// one blueprint round-trip after another.
	const resolved = await Promise.all(
		fields.map((field) => resolveField(field, chain, fetch)),
	);

	return resolved.some((field, index) => field !== fields[index])
		? resolved
		: fields;
}

async function resolveField(
	field: Field,
	chain: string[],
	fetch: Fetcher,
): Promise<Field> {
	if (field.field_type === "fieldset") {
		// Already resolved — including to the empty array an empty Blueprint
		// gives — so nothing to fetch.
		if (field.children != null) return field;

		const blueprintId = fieldsetBlueprintId(field);
		// An incomplete Fieldset is not an error here — the renderer says "No
		// blueprint selected" and the rest of the form still works.
		if (!blueprintId) return field;

		if (chain.includes(blueprintId)) {
			throw new Error(
				`Fieldset blueprint cycle detected: ${[...chain, blueprintId].join(" → ")}`,
			);
		}

		const children = await resolveFields(
			await fetch(blueprintId),
			[...chain, blueprintId],
			fetch,
		);
		return { ...field, children };
	}

	// A Group row, or any other container holding its children inline, can
	// embed a Fieldset of its own.
	if (!field.children?.length) return field;

	const children = await resolveFields(field.children, chain, fetch);
	return children === field.children ? field : { ...field, children };
}
