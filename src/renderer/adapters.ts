// src/renderer/adapters.ts
import type { Field } from "../schema/types";

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
  blueprint?: {
    getSchema: (blueprintId: string) => Promise<Field[]>;
    getData: (blueprintId: string, query: DataQuery) => Promise<DataPage>;
  };
  textType?: {
    getEditorSpec: (id: string) => Promise<EditorSpecData>;
    getGlobalSettings: () => Promise<EditorSpecGlobalSettings>;
    listEditorSpecs: () => Promise<EditorSpecData[]>;
  };
}
