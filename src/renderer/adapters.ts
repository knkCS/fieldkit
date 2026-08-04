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
	 * approximate. A Consumer written before this field existed keeps working
	 * unchanged, on the same terms as the optional methods below (ADR-0009).
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
