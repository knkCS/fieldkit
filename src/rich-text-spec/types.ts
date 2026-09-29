// src/rich-text-spec/types.ts
import type { Field } from "../schema/types";

/**
 * Category for grouping editor node/mark plugins.
 *
 * @deprecated Since 0.18; removed in 0.19 (ADR-0026). Text Types replace
 * `/rich-text-spec`: a `rich_text` Field pins a Text Type Release in
 * `settings.text_type`, knkeditor owns the vocabulary and generates the
 * option forms, and blueprinthub owns the Releases. See
 * `docs/migration-0.18.md`.
 */
export type EditorNodeCategory =
	| "formatting"
	| "structure"
	| "media"
	| "reference"
	| "special";

/**
 * Configuration for a node/mark's settings.
 *
 * @deprecated Since 0.18; removed in 0.19 (ADR-0026). Text Types replace
 * `/rich-text-spec`: a `rich_text` Field pins a Text Type Release in
 * `settings.text_type`, knkeditor owns the vocabulary and generates the
 * option forms, and blueprinthub owns the Releases. See
 * `docs/migration-0.18.md`.
 */
export interface NodeOptions {
	[key: string]: unknown;
}

/**
 * Plugin defining a TipTap node or mark that can be toggled in an EditorSpec.
 *
 * @deprecated Since 0.18; removed in 0.19 (ADR-0026). Text Types replace
 * `/rich-text-spec`: a `rich_text` Field pins a Text Type Release in
 * `settings.text_type`, knkeditor owns the vocabulary and generates the
 * option forms, and blueprinthub owns the Releases. See
 * `docs/migration-0.18.md`.
 */
export interface EditorNodePlugin {
	/** Unique identifier matching the TipTap extension name */
	id: string;
	/** Display name */
	name: string;
	/** Description for the editor spec UI */
	description: string;
	/** Category for grouping */
	category: EditorNodeCategory;
	/** Whether this is a mark (true) or node (false) */
	isMark: boolean;
	/** Default enabled state */
	defaultEnabled: boolean;
	/** Settings schema using fieldkit's own Field system (optional) */
	settingsSpec?: Field[];
	/** Default settings values */
	defaultSettings?: NodeOptions;
	/** Icon component from lucide-react */
	icon?: React.ComponentType<{ size?: number | string }>;
}

/**
 * A complete editor specification — which nodes/marks are enabled and their settings.
 *
 * @deprecated Since 0.18; removed in 0.19 (ADR-0026). Text Types replace
 * `/rich-text-spec`: a `rich_text` Field pins a Text Type Release in
 * `settings.text_type`, knkeditor owns the vocabulary and generates the
 * option forms, and blueprinthub owns the Releases. See
 * `docs/migration-0.18.md`.
 */
export interface EditorSpec {
	/** Unique ID */
	id: string;
	/** Display name */
	name: string;
	/** Optional description */
	description?: string;
	/** Page width in mm (for print-oriented editing) */
	page_width?: number;
	/** Enabled nodes with their settings */
	nodes: Record<string, NodeOptions>;
	/** Enabled marks with their settings */
	marks: Record<string, NodeOptions>;
}
