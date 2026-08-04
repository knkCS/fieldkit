// src/renderer/adapters.ts
import type {
	BlueprintSchemaAdapter,
	BlueprintSummary,
} from "../schema/resolve-spec";

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
		search: (blueprintIds: string[], query: string) => Promise<ReferenceItem[]>;
		fetch: (ids: string[]) => Promise<ReferenceItem[]>;
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
