// src/schema/plugin.ts
import type { ComponentType } from "react";
import type { ZodTypeAny } from "zod";
import type { Field } from "./types";

export type FieldTypeCategory =
	| "text"
	| "number"
	| "date"
	| "selection"
	| "boolean"
	| "structural"
	| "reference"
	| "media";

export type FieldContext = "blueprint" | "task" | "form";

/** Props passed to a field type's renderer component. */
export interface FieldProps<S = unknown> {
	field: Field<S>;
	readOnly?: boolean;
}

/** Props passed to a field type's settings editor component. */
export interface SettingsProps<S = unknown> {
	settings: S;
	onChange: (settings: S) => void;
	/** The Field being configured. Optional so the contract stays additive —
	 * every settings editor written before it keeps compiling. Present when
	 * the editor's config panel mounts the component; use it for anything that
	 * must name the Field rather than just edit its settings, such as
	 * reporting an adapter failure through the provider's `onError`. */
	field?: Field<S>;
}

/** Props passed to a field type's table cell component. */
export interface CellProps<S = unknown> {
	field: Field<S>;
	value: unknown;
}

/**
 * A field type plugin defines everything about a field type:
 * metadata, UI components, Zod validation, and constraints.
 */
export interface FieldTypePlugin<S = unknown> {
	id: string;
	name: string;
	description: string;
	icon: ComponentType<{ size?: number | string }>;
	category: FieldTypeCategory;

	settingsComponent?: ComponentType<SettingsProps<S>>;
	fieldComponent: ComponentType<FieldProps<S>>;
	cellComponent?: ComponentType<CellProps<S>>;

	toZodType: (field: Field<S>) => ZodTypeAny;

	defaultSettings?: S;
	/** Sane form-value default for fields of this type when the spec has no
	 * explicit `config.default_value` (value-level — `defaultSettings` seeds
	 * settings, not values). Always a function: settings-dependent shapes
	 * are natural, and array/object defaults stay fresh per call instead of
	 * being shared across forms. Omit when no safe default exists — the
	 * field then stays undefined. */
	defaultValue?: (field: Field<S>) => unknown;
	maxPerSpec?: number;
	availableIn?: FieldContext[];
}
