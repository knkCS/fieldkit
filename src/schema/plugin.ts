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
 * Composes a list of child Fields into the object schema they would generate
 * as a Spec of their own — the same marker skips, the same hidden skip, the
 * same required/optional shaping.
 *
 * Handed to `toZodType` as an optional second argument so a container type can
 * validate what it holds instead of accepting an opaque record (#53). The
 * alternative was teaching `specToZodSchema` about `fieldset` by name, which
 * would have made the value-less Marker skip-list a precedent for putting one
 * Field type's knowledge into shared machinery.
 *
 * `specToZodSchema`'s `overrides` are keyed by top-level accessor and are
 * deliberately not applied to children: a Consumer overriding `street` means
 * their own Field, not the one a Blueprint happens to embed under that name.
 */
export type ComposeChildSchema = (children: Field[]) => ZodTypeAny;

/** The defaults-side twin of {@link ComposeChildSchema}: the record a list of
 * child Fields would seed as a Spec of its own, explicit `default_value` and
 * per-plugin `defaultValue` alike. */
export type ComposeChildDefaults = (
	children: Field[],
) => Record<string, unknown>;

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

	/** `composeChildren` is what a container type needs and its own Field
	 * cannot give it (#53). It is optional on both sides: every plugin written
	 * against the one-argument signature keeps compiling and behaves
	 * identically, and a plugin that wants it must still cope without it —
	 * `toZodType` is public API and a Consumer may call it with a Field alone. */
	toZodType: (
		field: Field<S>,
		composeChildren?: ComposeChildSchema,
	) => ZodTypeAny;

	defaultSettings?: S;
	/** Sane form-value default for fields of this type when the spec has no
	 * explicit `config.default_value` (value-level — `defaultSettings` seeds
	 * settings, not values). Always a function: settings-dependent shapes
	 * are natural, and array/object defaults stay fresh per call instead of
	 * being shared across forms. Omit when no safe default exists — the
	 * field then stays undefined.
	 *
	 * `composeChildren` mirrors `toZodType`'s, on the same terms: optional,
	 * additive, and absent when a caller passes only a Field. */
	defaultValue?: (
		field: Field<S>,
		composeChildren?: ComposeChildDefaults,
	) => unknown;
	maxPerSpec?: number;
	availableIn?: FieldContext[];
}
