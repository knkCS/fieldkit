// src/test/fake-reference-adapter.ts
import type { FieldKitAdapters, ReferenceItem } from "../renderer/adapters";

/**
 * A Content in the fake catalogue. `ReferenceItem`'s index signature is what
 * keeps this additive: a Content may carry any extra field a later ticket
 * wants to surface (result columns, filterable properties) without this type
 * changing.
 */
export interface FakeContent extends ReferenceItem {
	id: string;
	display_name: string;
	blueprint_id?: string;
}

export interface FakeReferenceAdapterOptions {
	/** The catalogue to start from. Defaults to {@link FAKE_CONTENTS}. */
	contents?: FakeContent[];
	/** Reject every `search` with this error, for the degrade paths. */
	failSearch?: Error;
	/** Reject every `fetch` with this error, for the degrade paths. */
	failFetch?: Error;
}

export interface FakeReferenceAdapter
	extends NonNullable<FieldKitAdapters["reference"]> {
	/** The catalogue as the fake currently holds it. */
	readonly contents: FakeContent[];
	/**
	 * Rename a Content the way an Author working somewhere else would.
	 *
	 * The point of the fixture: a saved Reference stores only an id, so the
	 * name a Field shows must come from here on every load.
	 */
	rename(id: string, displayName: string): void;
}

/**
 * The default catalogue: two Blueprints, so a test can prove a Field
 * constrained to one of them never offers the other's Contents.
 */
export const FAKE_CONTENTS: FakeContent[] = [
	{
		id: "article-1",
		display_name: "Cats of the world",
		blueprint_id: "article",
	},
	{
		id: "article-2",
		display_name: "Dogs of the world",
		blueprint_id: "article",
	},
	{
		id: "article-3",
		display_name: "Catalogues explained",
		blueprint_id: "article",
	},
	{ id: "author-1", display_name: "Ada Lovelace", blueprint_id: "author" },
	{ id: "author-2", display_name: "Grace Hopper", blueprint_id: "author" },
];

/**
 * An in-memory stand-in for a Consumer's reference Adapter.
 *
 * Every adapter-backed Reference test drives through this rather than
 * hand-rolling a `vi.fn()` per test, so "what the Adapter does" is written
 * down once: search honours the Blueprint constraint, `fetch` returns only
 * the Contents that exist, and a name only ever comes from here.
 *
 * Shaped to grow: pagination and the two Spec methods (#63) and Pin targets
 * (#68) are additions to the options and the returned object, not rewrites of
 * either.
 */
export function createFakeReferenceAdapter(
	options: FakeReferenceAdapterOptions = {},
): FakeReferenceAdapter {
	// Copied, so one test's rename cannot leak into the next through the
	// shared default catalogue.
	const contents = (options.contents ?? FAKE_CONTENTS).map((content) => ({
		...content,
	}));

	function matches(content: FakeContent, blueprintIds: string[]): boolean {
		// No Blueprints configured means the Adapter decides — fieldkit has no
		// notion of a Blueprint kind (ADR-0002), so it cannot narrow further.
		if (blueprintIds.length === 0) return true;
		return (
			content.blueprint_id !== undefined &&
			blueprintIds.includes(content.blueprint_id)
		);
	}

	return {
		contents,

		rename(id, displayName) {
			const content = contents.find((candidate) => candidate.id === id);
			if (content) content.display_name = displayName;
		},

		async search(blueprintIds, query) {
			if (options.failSearch) throw options.failSearch;
			const needle = query.trim().toLowerCase();
			return contents
				.filter((content) => matches(content, blueprintIds))
				.filter(
					(content) =>
						needle === "" ||
						content.display_name.toLowerCase().includes(needle),
				)
				.map((content) => ({ ...content }));
		},

		async fetch(ids) {
			if (options.failFetch) throw options.failFetch;
			// Only what exists: an id with no Content is simply absent from the
			// result, which is how a caller learns it cannot be resolved.
			return ids
				.map((id) => contents.find((content) => content.id === id))
				.filter((content): content is FakeContent => content !== undefined)
				.map((content) => ({ ...content }));
		},
	};
}
