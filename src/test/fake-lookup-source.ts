// src/test/fake-lookup-source.ts
import type {
	LookupItem,
	LookupSearchQuery,
	LookupSource,
} from "../renderer/adapters";

/**
 * The default Source: layout stylesheets, the case that motivated the type.
 *
 * Deliberately a collection with no Blueprint, no Versions and no Releases —
 * exactly what makes it a Lookup rather than a Reference. Named so a test can
 * tell one from another by reading a row.
 */
export const FAKE_STYLESHEETS: LookupItem[] = [
	{ id: "sheet-1", label: "Boorberg print", description: "A4, two columns" },
	{ id: "sheet-2", label: "Boorberg screen", description: "Responsive" },
	{ id: "sheet-3", label: "Draft proof", description: "A4, wide margins" },
];

/** A second Source, so a test can prove the Field consulted the one its
 * settings named and not merely the only one registered. */
export const FAKE_PRINTERS: LookupItem[] = [
	{ id: "printer-1", label: "Metasystems OASYS" },
	{ id: "printer-2", label: "Proof printer" },
];

export interface FakeLookupSourceOptions {
	/** The collection to search. Defaults to {@link FAKE_STYLESHEETS}. */
	items?: LookupItem[];
	/** Reject every `search` with this error, for the degrade path. */
	failSearch?: Error;
	/** Reject every `resolveByIds` with this error, for the degrade path. */
	failResolve?: Error;
	/**
	 * Omit `resolveByIds` altogether — the degrade path for a Consumer that
	 * has not implemented resolution, where a stored id must read as itself.
	 *
	 * A factory option rather than a hand-rolled half-Source, so the test that
	 * depends on the absence stands on the same fixture as everything else.
	 */
	withoutResolve?: boolean;
}

export interface FakeLookupSource extends LookupSource {
	/**
	 * Always implemented here, though the Source interface makes it optional —
	 * narrowed back so a test can call it without a null check. `withoutResolve`
	 * is how a test drives the absence.
	 */
	resolveByIds: (ids: string[]) => Promise<LookupItem[]>;
	/**
	 * Every query `search` was called with, oldest first.
	 *
	 * The one way to assert what fieldkit *sent* rather than what it rendered —
	 * that the page it asked for advanced, and that the typed query reached the
	 * Source rather than being filtered in the browser.
	 */
	readonly searches: LookupSearchQuery[];
	/** Every id list `resolveByIds` was called with, oldest first. The one way
	 * to prove a surface resolved *no* labels, which nothing rendered can show:
	 * a control displaying an id looks the same whether or not it also asked. */
	readonly resolves: string[][];
}

/**
 * An in-memory stand-in for one of a Consumer's Sources.
 *
 * Every `lookup` test drives through this rather than hand-rolling a `vi.fn()`
 * per test, so "what a Source does" is written down once: search honours the
 * query and the page, and `resolveByIds` answers only for ids that exist.
 */
export function createFakeLookupSource(
	options: FakeLookupSourceOptions = {},
): FakeLookupSource {
	// Copied, so one test's fixture cannot leak into the next through the
	// shared default collection.
	const items = (options.items ?? FAKE_STYLESHEETS).map((item) => ({
		...item,
	}));
	const searches: LookupSearchQuery[] = [];
	const resolves: string[][] = [];

	const resolveByIds = async (ids: string[]): Promise<LookupItem[]> => {
		resolves.push([...ids]);
		if (options.failResolve) throw options.failResolve;
		// Only what exists: an id with nothing behind it is simply absent, which
		// is how the control learns it cannot be resolved.
		return ids
			.map((id) => items.find((item) => item.id === id))
			.filter((item): item is LookupItem => item !== undefined)
			.map((item) => ({ ...item }));
	};

	const search = async (request: LookupSearchQuery) => {
		searches.push(request);
		if (options.failSearch) throw options.failSearch;

		const needle = request.query.trim().toLowerCase();
		const matched = items.filter(
			(item) => needle === "" || item.label.toLowerCase().includes(needle),
		);
		const start = (Math.max(1, request.page) - 1) * request.page_size;
		return {
			items: matched
				.slice(start, start + request.page_size)
				.map((item) => ({ ...item })),
			// The count across every page, not this page's length: it is the
			// only thing that can say whether there is another page.
			total: matched.length,
		};
	};

	const full: FakeLookupSource = { searches, resolves, search, resolveByIds };
	// The method is *removed*, not stubbed: the control reads its presence to
	// decide whether to resolve at all, so a stub would prove nothing.
	if (options.withoutResolve) {
		const { resolveByIds: _omitted, ...withoutResolve } = full;
		return withoutResolve as FakeLookupSource;
	}
	return full;
}

/**
 * A collection big enough to page through.
 *
 * `count` items named so a test can tell page one from page two by reading a
 * row.
 */
export function fakeLookupCollection(count: number, prefix = "sheet") {
	return Array.from({ length: count }, (_, index) => ({
		id: `${prefix}-${index + 1}`,
		label: `Stylesheet ${index + 1}`,
	}));
}
