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
	maxPerSpec?: number;
	availableIn?: FieldContext[];
}
