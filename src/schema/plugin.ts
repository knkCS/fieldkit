// src/schema/plugin.ts
import type { ComponentType, ReactNode } from "react";
import type { ZodObject, ZodRawShape, ZodTypeAny } from "zod";
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

/**
 * Where a Field is being authored — which decides the types on offer.
 *
 * `"attribute"` is the Attribute Spec of a Reference Field: the Fields an
 * Author declares once per Field and someone filling in the form fills per
 * Reference. It offers strictly less than the other three, and deliberately:
 *
 * - **No Marker.** Attributes render in a drawer, and there is no Tab or Card
 *   there for a Section or a Card to open.
 * - **No container.** The Attribute Spec lives in settings, so shared traversal
 *   never reaches it (ADR-0007) — a Fieldset would never resolve, and a Group's
 *   children would never have their Accessors checked.
 * - **No reference type.** Cycle rejection walks `children`, so a Reference
 *   Field declared as an Attribute of a Reference Field is a recursion nothing
 *   would catch.
 */
export type FieldContext = "blueprint" | "task" | "form" | "attribute";

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
	/**
	 * Opens the config panel's drill-in on a Field these settings hold under
	 * `settingsKey`, named by its Accessor — the way a Spec nested in settings
	 * (a Reference Field's Attributes) is configured without a second nested
	 * editor existing anywhere.
	 *
	 * The plugin passes its own key; the panel never learns which setting of
	 * which Field type holds Fields. Optional, because a settings editor may be
	 * mounted somewhere with no drill-in behind it — a Storybook story, a
	 * Consumer's own panel — and must still render.
	 */
	onDrillIn?: (settingsKey: string, accessor: string) => void;
	/**
	 * Every registered field type, for a settings editor that lets an Author
	 * declare Fields of its own and therefore has to offer a type picker.
	 *
	 * Optional on the same terms as `onDrillIn`: a settings editor mounted
	 * outside the config panel gets neither, and must still render.
	 */
	plugins?: FieldTypePlugin[];
}

/** Props passed to a field type's table cell component. */
export interface CellProps<S = unknown> {
	field: Field<S>;
	value: unknown;
}

/**
 * Renders one Field's stored value exactly as read mode renders any value —
 * the empty-value convention, the plugin's own read component, its cell, the
 * type-aware fallback, in that order.
 *
 * Handed to a read component so it can render what it *holds* without knowing
 * how any of it should look: a Group's rows are its children's values, a
 * Reference's Attributes are Fields declared in its settings, and both come
 * out of the same machinery a top-level Field's value does.
 */
export type RenderReadValue = (field: Field, value: unknown) => ReactNode;

/**
 * Props passed to a field type's read-mode component.
 *
 * `renderChild` is the read-mode twin of {@link ComposeChildrenSchema}, and it
 * is there for the same reason: a container has to render what it holds, and
 * the shared read machinery must not learn its name to do it.
 */
export interface ReadProps<S = unknown> {
	field: Field<S>;
	value: unknown;
	renderChild: RenderReadValue;
}

/**
 * Composes a list of child Fields into the object schema they would generate
 * as a Spec of their own — the same marker skips, the same hidden skip, the
 * same required/optional shaping.
 *
 * Handed to `toZodType` as an optional second argument so a container type can
 * validate what it holds instead of accepting an opaque record (ADR-0007). The
 * alternative was teaching `specToZodSchema` about `fieldset` by name, which
 * would have made the value-less Marker skip-list a precedent for putting one
 * Field type's knowledge into shared machinery.
 *
 * An object rather than a bare `ZodTypeAny`, because that is the contract worth
 * promising: a caller can `.extend()`, `.partial()` or `.passthrough()` what it
 * gets back. Parsing therefore strips keys the children don't declare, exactly
 * as it does at the top level.
 *
 * `specToZodSchema`'s `overrides` are keyed by top-level accessor and are
 * deliberately not applied to children: a Consumer overriding `street` means
 * their own Field, not the one a Blueprint happens to embed under that name.
 */
export type ComposeChildrenSchema = (
	children: Field[],
) => ZodObject<ZodRawShape>;

/** The defaults-side twin of {@link ComposeChildrenSchema}: the record a list
 * of child Fields would seed as a Spec of its own, explicit `default_value`
 * and per-plugin `defaultValue` alike. */
export type ComposeChildrenDefaults = (
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
	/**
	 * How SpecForm's read mode renders a value of this type, when a table cell
	 * is the wrong answer for it.
	 *
	 * Read mode renders through `cellComponent` by default — one rendering for
	 * a table and a read-only form is the ordinary case. A type declares this
	 * instead when the two genuinely differ: read mode sits inside the
	 * renderer, so it reaches the adapters and can be as tall as it likes,
	 * while a cell has neither adapter access nor async and one row of height.
	 * A Group's cell counts items and its read component shows them; a
	 * Reference's cell counts References and its read component resolves their
	 * names and nests them (ADR-0008).
	 *
	 * It lives on the plugin rather than as a branch in read mode's own code
	 * for ADR-0007's reason — shared machinery does not learn Field type names
	 * — and because for reference types it *cannot* be a branch: a Consumer
	 * mints its own reference-shaped type under its own id (ADR-0010), and no
	 * list of names in shared code would ever contain it.
	 */
	readComponent?: ComponentType<ReadProps<S>>;

	/** `composeChildren` is what a container type needs and its own Field
	 * cannot give it (#53). It is optional on both sides: every plugin written
	 * against the one-argument signature keeps compiling and behaves
	 * identically, and a plugin that wants it must still cope without it —
	 * `toZodType` is public API and a Consumer may call it with a Field alone. */
	toZodType: (
		field: Field<S>,
		composeChildren?: ComposeChildrenSchema,
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
		composeChildren?: ComposeChildrenDefaults,
	) => unknown;
	maxPerSpec?: number;
	availableIn?: FieldContext[];
}
