// src/test/fake-reference-adapter.ts
import type {
	FieldKitAdapters,
	PinTarget,
	ReferenceItem,
	ReferenceSearchQuery,
} from "../renderer/adapters";
import type { PinningMode } from "../schema/reference";
import type { Field } from "../schema/types";

/**
 * What one Content offers to be pinned to, per kind.
 *
 * A record keyed by `PinningMode` rather than two fields, so a Content says
 * what it offers in exactly the terms `listPinTargets` is asked in. A kind left
 * out falls back to the generated targets — declaring Releases must not
 * silently empty a Content's Versions.
 */
export type FakePinTargets = Partial<Record<PinningMode, PinTarget[]>>;

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
	/**
	 * Stands in for a Consumer's own vocabulary — knkCMS would call this a
	 * Content's status. It is here precisely because fieldkit must never learn
	 * that this key exists: the filter Spec below names it, the picker collects
	 * a value for it and hands the whole record back, and only this fixture
	 * ever reads it.
	 */
	status?: string;
	/**
	 * What this Content offers to be pinned to. Absent — the usual case — means
	 * the generated targets below, which every Content has.
	 */
	pin_targets?: FakePinTargets;
}

export interface FakeReferenceAdapterOptions {
	/** The catalogue to start from. Defaults to {@link FAKE_CONTENTS}. */
	contents?: FakeContent[];
	/** Reject every `search` with this error, for the degrade paths. */
	failSearch?: Error;
	/** Reject every `fetch` with this error, for the degrade paths. */
	failFetch?: Error;
	/** Reject every `listPinTargets` with this error, for the degrade paths. */
	failPinTargets?: Error;
	/**
	 * The Spec `getSearchFilters()` answers with. `null` omits the method
	 * altogether — the degrade path for a Consumer that has not implemented
	 * filtering. Defaults to {@link FAKE_SEARCH_FILTERS}.
	 */
	searchFilters?: Field[] | null;
	/**
	 * The Spec `getResultColumns()` answers with, on the same terms: `null`
	 * omits the method. Defaults to {@link FAKE_RESULT_COLUMNS}.
	 */
	resultColumns?: Field[] | null;
}

export interface FakeReferenceAdapter
	extends NonNullable<FieldKitAdapters["reference"]> {
	/**
	 * Always implemented here, though the Adapter surface makes it optional.
	 *
	 * Narrowed back to required so the fixture's own tests can call it without
	 * a null check. To drive the degrade path a test **strips it deliberately**
	 * — `const { listPinTargets, ...adapter } = createFakeReferenceAdapter()` —
	 * rather than asking the factory for a half-built Adapter, so what is
	 * missing is visible in the test that depends on it.
	 */
	listPinTargets: (
		contentId: string,
		mode: PinningMode,
	) => Promise<PinTarget[]>;
	/** The catalogue as the fake currently holds it. */
	readonly contents: FakeContent[];
	/**
	 * Every query `search` was called with, oldest first.
	 *
	 * The one way to assert what fieldkit sent rather than what it rendered —
	 * most of all that the filter record arrived exactly as the filter form
	 * held it, with nothing inspected, renamed or dropped on the way.
	 */
	readonly searches: ReferenceSearchQuery[];
	/**
	 * Every id list `fetch` was called with, oldest first.
	 *
	 * The one way to prove a surface resolved *no* names — which a table cell
	 * must not, having neither Adapter access nor async. Nothing rendered can
	 * show that: a cell showing a count looks the same whether or not it also
	 * asked.
	 */
	readonly fetches: string[][];
	/**
	 * Every Pin target lookup, oldest first.
	 *
	 * The one way to assert that the *Field's* setting decided which kind of
	 * target was offered — the value never says, so nothing else can prove it.
	 */
	readonly pinTargetQueries: { contentId: string; mode: PinningMode }[];
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
		status: "published",
	},
	{
		id: "article-2",
		display_name: "Dogs of the world",
		blueprint_id: "article",
		status: "draft",
	},
	{
		id: "article-3",
		display_name: "Catalogues explained",
		blueprint_id: "article",
		status: "published",
	},
	{
		id: "author-1",
		display_name: "Ada Lovelace",
		blueprint_id: "author",
		status: "published",
	},
	{
		id: "author-2",
		display_name: "Grace Hopper",
		blueprint_id: "author",
		status: "draft",
	},
];

function field(
	fieldType: string,
	accessor: string,
	name: string,
	settings: unknown = null,
): Field {
	return {
		field_type: fieldType,
		config: {
			name,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings,
		children: null,
		system: false,
	};
}

/**
 * How this fake describes a query over its catalogue (ADR-0009).
 *
 * A `select` over a Consumer noun fieldkit has never heard of. Rendering it is
 * the whole point: the filter form comes out of fieldkit's own renderer, and
 * the value comes back through `search` as an opaque record.
 */
export const FAKE_SEARCH_FILTERS: Field[] = [
	field("select", "status", "Status", {
		options: { draft: "Draft", published: "Published" },
	}),
];

/**
 * The Pin targets a Content has unless it declares its own.
 *
 * Deliberately worded so the two kinds cannot be mistaken for each other: a
 * test that reads "Spring release" on screen has proved the Field's `pin_mode`
 * — and nothing in the value — chose what was offered. Newest first, which is
 * the order a person expects to pick from.
 */
function generatedPinTargets(
	contentId: string,
	mode: PinningMode,
): PinTarget[] {
	if (mode === "release") {
		return [
			{
				id: `${contentId}-r2`,
				label: "Spring release",
				description: "Published 2 March 2026",
			},
			{
				id: `${contentId}-r1`,
				label: "Launch",
				description: "Published 1 March 2026",
			},
		];
	}
	return [3, 2, 1].map((n) => ({
		id: `${contentId}-v${String(n)}`,
		label: `Version ${String(n)}`,
		description: `Saved ${String(n)} March 2026`,
	}));
}

/** How this fake describes one Content row — the picker's result columns. */
export const FAKE_RESULT_COLUMNS: Field[] = [
	field("text", "display_name", "Name"),
	field("text", "status", "Status"),
];

/**
 * An in-memory stand-in for a Consumer's reference Adapter.
 *
 * Every adapter-backed Reference test drives through this rather than
 * hand-rolling a `vi.fn()` per test, so "what the Adapter does" is written
 * down once: search honours the Blueprint constraint, the query, the filters
 * and the page; `fetch` returns only the Contents that exist; `listPinTargets`
 * answers in the kind it was asked for; and a name only ever comes from here.
 */
export function createFakeReferenceAdapter(
	options: FakeReferenceAdapterOptions = {},
): FakeReferenceAdapter {
	// Copied, so one test's rename cannot leak into the next through the
	// shared default catalogue.
	const contents = (options.contents ?? FAKE_CONTENTS).map((content) => ({
		...content,
	}));
	const searches: ReferenceSearchQuery[] = [];
	const fetches: string[][] = [];
	const pinTargetQueries: { contentId: string; mode: PinningMode }[] = [];

	const searchFilters =
		options.searchFilters === undefined
			? FAKE_SEARCH_FILTERS
			: options.searchFilters;
	const resultColumns =
		options.resultColumns === undefined
			? FAKE_RESULT_COLUMNS
			: options.resultColumns;

	function matchesBlueprints(
		content: FakeContent,
		blueprintIds: string[],
	): boolean {
		// No Blueprints configured means the Adapter decides — fieldkit has no
		// notion of a Blueprint kind (ADR-0002), so it cannot narrow further.
		if (blueprintIds.length === 0) return true;
		return (
			content.blueprint_id !== undefined &&
			blueprintIds.includes(content.blueprint_id)
		);
	}

	/**
	 * Equality on whatever key the filter Spec named, skipping the ways a form
	 * control says "nothing chosen".
	 *
	 * Skipping them here rather than in the picker is deliberate: fieldkit
	 * sends the filter form's record whole, empty entries and all, because
	 * deciding that `""` means "no constraint" is a query language's business
	 * and this fixture is standing in for one.
	 */
	function matchesFilters(
		content: FakeContent,
		filters: Record<string, unknown>,
	): boolean {
		return Object.entries(filters).every(([key, value]) => {
			if (value === undefined || value === null || value === "") return true;
			if (Array.isArray(value)) {
				return value.length === 0 || value.some((v) => content[key] === v);
			}
			return content[key] === value;
		});
	}

	return {
		contents,
		searches,
		fetches,
		pinTargetQueries,

		rename(id, displayName) {
			const content = contents.find((candidate) => candidate.id === id);
			if (content) content.display_name = displayName;
		},

		async search(request) {
			searches.push(request);
			if (options.failSearch) throw options.failSearch;

			const needle = request.query.trim().toLowerCase();
			const matched = contents
				.filter((content) => matchesBlueprints(content, request.blueprintIds))
				.filter(
					(content) =>
						needle === "" ||
						content.display_name.toLowerCase().includes(needle),
				)
				.filter((content) => matchesFilters(content, request.filters));

			const start = (Math.max(1, request.page) - 1) * request.page_size;
			return {
				items: matched
					.slice(start, start + request.page_size)
					.map((content) => ({ ...content })),
				// The count across every page, not this page's length: it is the
				// only thing the picker's pagination can be built from.
				total: matched.length,
			};
		},

		async fetch(ids) {
			fetches.push([...ids]);
			if (options.failFetch) throw options.failFetch;
			// Only what exists: an id with no Content is simply absent from the
			// result, which is how a caller learns it cannot be resolved.
			return ids
				.map((id) => contents.find((content) => content.id === id))
				.filter((content): content is FakeContent => content !== undefined)
				.map((content) => ({ ...content }));
		},

		async listPinTargets(contentId, mode) {
			pinTargetQueries.push({ contentId, mode });
			if (options.failPinTargets) throw options.failPinTargets;

			const content = contents.find((candidate) => candidate.id === contentId);
			// A Content that no longer resolves has nothing to pin to, the same
			// way `fetch` simply omits it: an empty list, not an error.
			if (!content) return [];
			return (
				content.pin_targets?.[mode] ?? generatedPinTargets(contentId, mode)
			).map((target) => ({ ...target }));
		},

		// Omitted entirely when the options said so, so a test can drive the
		// picker's degrade path through the same fixture as everything else.
		...(searchFilters ? { getSearchFilters: () => searchFilters } : {}),
		...(resultColumns ? { getResultColumns: () => resultColumns } : {}),
	};
}

/**
 * A catalogue big enough to page through.
 *
 * `count` Contents in one Blueprint, named so a test can tell page one from
 * page two by reading a row.
 */
export function fakeCatalogue(count: number, blueprintId = "article") {
	return Array.from({ length: count }, (_, index) => ({
		id: `${blueprintId}-${index + 1}`,
		display_name: `Content ${index + 1}`,
		blueprint_id: blueprintId,
		status: index % 2 === 0 ? "published" : "draft",
	}));
}

/**
 * A Reference Tree of `count` References over {@link fakeCatalogue}'s ids.
 *
 * Parent/child pairs, so every other row carries a branch to fold — which is
 * what a tree big enough to open collapsed has to be made of. `count` is the
 * *whole* tree, children included, because that is what the Field counts.
 */
export function fakeReferenceTree(count: number, blueprintId = "article") {
	const roots = [];
	for (let n = 1; n <= count; n += 2) {
		const root = { id: `${blueprintId}-${n}` };
		roots.push(
			n + 1 <= count
				? { ...root, children: [{ id: `${blueprintId}-${n + 1}` }] }
				: root,
		);
	}
	return roots;
}
