// src/renderer/adapters.ts
import type { PinningMode } from "../schema/reference";
import type {
	BlueprintSchemaAdapter,
	BlueprintSummary,
} from "../schema/resolve-spec";
import type { Field } from "../schema/types";

/** Re-exported so the blueprint adapter's whole vocabulary is reachable from
 * the layer that declares it, as well as from `/schema` where it is defined
 * beside `BlueprintSchemaAdapter`. */
export type { BlueprintSummary };

export interface ReferenceItem {
	id: string;
	display_name: string;
	blueprint_id?: string;
	[key: string]: unknown;
}

/**
 * One page of a browse through the Contents a Reference may point at.
 *
 * A query object rather than positional arguments because a browsable picker
 * needs more than a string, and every part of it is optional to *honour* but
 * mandatory to *receive* — an Adapter that ignores `filters` still compiles
 * against the same type as one that implements them (ADR-0009).
 */
export interface ReferenceSearchQuery {
	/** The Blueprints the Field is constrained to. Empty means no constraint —
	 * fieldkit has no notion of a Blueprint kind (ADR-0002), so the Adapter
	 * decides. */
	blueprintIds: string[];
	/** What the person filling in the form typed. */
	query: string;
	/**
	 * The filter form's values, keyed by the Accessors of the Fields
	 * `getSearchFilters()` returned.
	 *
	 * **Opaque to fieldkit.** It collects these values with its own renderer
	 * and hands the record straight back without reading a single key — that
	 * is what keeps a Consumer's vocabulary (a status, an assigned user) out
	 * of fieldkit's catalogue.
	 */
	filters: Record<string, unknown>;
	/**
	 * The Contents this Field already references — what the picker must stop
	 * offering, since adding one again would put the same Content in the tree
	 * twice.
	 *
	 * **Optional, and additive.** An Adapter that honours it excludes them at
	 * the source, so its `total` counts exactly what it returned; one that
	 * ignores it is not wrong, only less precise — fieldkit drops them from the
	 * page it was handed either way, and the total it then shows is
	 * approximate. Not honouring it is a valid implementation, which is what
	 * the optional marker says, on the same terms as the optional methods below
	 * (ADR-0009). The marker also keeps this type *constructible* by a Consumer
	 * — one proxying, logging or re-issuing a query builds a
	 * `ReferenceSearchQuery` of its own, and must not have to learn a new field
	 * to keep compiling.
	 *
	 * Fieldkit itself always sends it, empty array included.
	 *
	 * It is the whole of what the Field holds, not its roots: a Content nested
	 * three levels down is already referenced too. For a Single Reference it is
	 * the one Content stored, so re-picking it is not offered as a change.
	 *
	 * This is a **policy about the picker, not about the value**: a Reference
	 * Tree keys its rows by path precisely so the same Content *can* appear
	 * twice, and nothing here refuses such a value.
	 */
	excludeIds?: string[];
	/** 1-based. */
	page: number;
	page_size: number;
}

/** What a {@link ReferenceSearchQuery} answers with: the page's Contents, and
 * how many there are in total. The total is what the picker's pagination is
 * built from — the Adapter is the only thing that knows it. */
export interface ReferenceSearchResult {
	items: ReferenceItem[];
	total: number;
}

/**
 * One thing a Reference may be pinned to, already normalised by the Adapter.
 *
 * Deliberately not a Release and not a Version: fieldkit models neither
 * (ADR-0002), so the Adapter flattens whichever it was asked for into an id to
 * store and words to read. The Field's `pin_mode` is what says which kind
 * these are — a target never says so itself, and neither does the stored Pin.
 */
export interface PinTarget {
	/** What a Reference's `pin` stores. The only part that is ever written. */
	id: string;
	/** What the person filling in the form reads — a Release's title, a
	 * Version's number, whatever the Consumer calls it. */
	label: string;
	/** A second line where one helps tell two targets apart: a publication
	 * date, an author, a tag. Optional because not every Consumer has one. */
	description?: string;
}

export interface MediaItem {
	id: string;
	filename: string;
	url: string;
	mime_type: string;
	size: number;
	[key: string]: unknown;
}

export interface MediaFilter {
	mime_types?: string[];
	query?: string;
}

/**
 * One thing a Lookup may point at, already normalised by the Source.
 *
 * Deliberately not a {@link ReferenceItem}: a Lookup does not point at a
 * Content. It points into a collection that lives somewhere else entirely — a
 * layout stylesheet, a printer profile — with no Blueprint, no Versions and no
 * Releases, so there is nothing here to pin to and nothing to resolve a
 * `display_name` from. Three parts, and the same three a {@link PinTarget} has,
 * for the same reason: an id to store, words to read, and a second line where
 * one helps tell two apart.
 */
export interface LookupItem {
	id: string;
	/** What the person filling in the form reads. */
	label: string;
	/** A second line where one helps tell two items apart. Optional because not
	 * every Source has one. */
	description?: string;
}

/**
 * One page of a search through a Source.
 *
 * A query object taking `page` and `page_size`, on exactly the terms
 * {@link ReferenceSearchQuery} does — one adapter surface, one way of asking
 * for a page. The atom underneath pages by opaque cursor; translating between
 * the two is fieldkit's job, not a Consumer's (see
 * `docs/adr/0015-lookup-is-generic-and-keyed-by-source.md`).
 */
export interface LookupSearchQuery {
	/** What the person filling in the form typed. Empty on the first open. */
	query: string;
	/** 1-based. */
	page: number;
	page_size: number;
}

/** What a {@link LookupSearchQuery} answers with: the page's items, and how
 * many there are in total. The total is the only thing that can say whether
 * there is another page — the Source is the only thing that knows it. */
export interface LookupSearchResult {
	items: LookupItem[];
	total: number;
}

/**
 * One external collection a `lookup` Field may point into, registered by the
 * Consumer under an id its Fields name.
 *
 * Fieldkit knows nothing about what is in a Source — not its name, not its
 * shape, not where it lives. It knows only how to ask (ADR-0002).
 */
export interface LookupSource {
	search: (query: LookupSearchQuery) => Promise<LookupSearchResult>;
	/**
	 * Turns stored ids back into readable items.
	 *
	 * **Optional on purpose** (ADR-0009). Without it a stored id reads as the
	 * id — visibly degraded rather than blank, and rather than an error. That is
	 * what a Consumer who has not implemented resolution should get.
	 *
	 * Ids with nothing behind them are simply absent from the answer, the way
	 * `reference.fetch` omits a Content that no longer exists; each of them then
	 * reads as its id too.
	 */
	resolveByIds?: (ids: string[]) => Promise<LookupItem[]>;
}

export interface DataQuery {
	page?: number;
	page_size?: number;
	sort_by?: string;
	sort_order?: "asc" | "desc";
}

export interface DataPage<T = Record<string, unknown>> {
	items: T[];
	total: number;
	page: number;
	page_size: number;
}

export interface EditorSpecData {
	id: string;
	name: string;
	description?: string;
	page_width?: number;
	nodes: Record<string, Record<string, unknown>>;
	marks: Record<string, Record<string, unknown>>;
}

export interface EditorSpecGlobalSettings {
	[key: string]: unknown;
}

export interface FieldKitAdapters {
	reference?: {
		search: (query: ReferenceSearchQuery) => Promise<ReferenceSearchResult>;
		fetch: (ids: string[]) => Promise<ReferenceItem[]>;
		/**
		 * What one Content offers to be pinned to, in the kind the Field's
		 * `pin_mode` asked for.
		 *
		 * **Optional, on the same terms as the two Spec methods below.** Without
		 * it a pinning Field degrades to offering the newest Version and nothing
		 * else — the same answer a Consumer gets from returning an empty list,
		 * and the same one this Field already shows while the targets are in
		 * flight or after a failed call. A Consumer that has not implemented
		 * pinning should get that rather than an error (ADR-0009).
		 *
		 * Absence is a configuration, not a failure, so it is **not** reported
		 * through `onError` — unlike a call that rejects, which is.
		 *
		 * Only the Adapter can know a Content's Releases or Versions, and it is
		 * the Adapter that normalises whichever kind was asked for into an id, a
		 * label and a description — so fieldkit models neither a Release nor a
		 * Version.
		 *
		 * Never called with `"none"` — a Field that does not pin never asks.
		 */
		listPinTargets?: (
			contentId: string,
			mode: PinningMode,
		) => Promise<PinTarget[]>;
		/**
		 * The Fields describing a query over this Consumer's Contents — what
		 * the picker's filter form renders.
		 *
		 * **Optional on purpose.** Without it the picker degrades to a search
		 * box, which is what a Consumer that has not implemented filtering
		 * should get rather than an error (ADR-0009).
		 *
		 * Whatever these Fields collect travels back through `search` as
		 * {@link ReferenceSearchQuery.filters}, untouched.
		 */
		getSearchFilters?: () => Field[];
		/**
		 * The Fields describing one Content row — what the picker's result
		 * table renders as columns, each field type bringing its own cell.
		 *
		 * Optional on the same terms as `getSearchFilters`: without it the
		 * results show a name column and nothing else.
		 *
		 * A separate Spec rather than a flag on the filter one, because the
		 * two model different things: a query is not a Content.
		 */
		getResultColumns?: () => Field[];
	};
	media?: {
		upload: (file: File) => Promise<MediaItem>;
		browse: (filter: MediaFilter) => Promise<MediaItem[]>;
	};
	/**
	 * The Sources a `lookup` Field may point into, keyed by the id its
	 * `source` setting names.
	 *
	 * **A record, where every other key on this object is an object of
	 * functions.** That is the whole design (ADR-0015): a Consumer adds a
	 * Source by adding a key, with nothing here to change and no other Source
	 * to disturb; fieldkit can tell "no Source registered under that id" from
	 * "the Source found nothing" and degrade with a message that names the id;
	 * and each Source is testable on its own.
	 *
	 * Absent, empty, or missing the id a Field names all degrade the same way
	 * — the Field says so and renders nothing to pick from, on the same terms
	 * as a missing `reference` adapter (ADR-0009).
	 */
	lookup?: Record<string, LookupSource>;
	/** `getSchema` is the schema layer's `BlueprintSchemaAdapter`, so the same
	 * adapters object serves `resolveSpec()` and the provider alike. */
	blueprint?: BlueprintSchemaAdapter & {
		getData: (blueprintId: string, query: DataQuery) => Promise<DataPage>;
		/**
		 * The Blueprints an Author may embed, for the Fieldset config panel's
		 * picker (#52).
		 *
		 * **Optional on purpose.** Fetching one Blueprint and enumerating them
		 * are different capabilities, and a Consumer built against the former
		 * must keep working: without this, the panel degrades to Blueprint id
		 * entry rather than breaking.
		 *
		 * Fieldkit does no filtering of its own — it has no notion of a
		 * Blueprint kind (ADR-0002). Return exactly the Blueprints this Author
		 * may embed; knkCMS core, for instance, narrows to its `fieldset`
		 * blueprint type on its side.
		 */
		list?: () => Promise<BlueprintSummary[]>;
	};
	textType?: {
		getEditorSpec: (id: string) => Promise<EditorSpecData>;
		getGlobalSettings: () => Promise<EditorSpecGlobalSettings>;
		listEditorSpecs: () => Promise<EditorSpecData[]>;
	};
}
