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
 * A Consumer whose type picker may offer a Field Type (ADR-0022).
 *
 * Advice for pickers, never a rule: nothing validates it, and the Go module
 * ignores it. A Consumer passes its own to `SpecEditor` as `consumer`, and the
 * picker offers the types whose `consumers` name it.
 */
export type Consumer = "blueprint" | "task" | "form";

/**
 * Where in a Spec a Field sits, which decides the Field Types it may be
 * (ADR-0022). Enforced: `validateSpec()` reports a Field in a Position its type
 * does not list as `position`, in TS and in Go.
 *
 * - `root` — the top level of a Spec.
 * - `row` — a Virtual Table's Row Spec (ADR-0017): flat value Fields only, each
 *   one a cell and a drawer control.
 * - `reference_spec` — the Reference Spec of a Reference Field, filled in per
 *   Reference in a drawer. No Marker (there is no Tab or Card in a drawer), no
 *   container (a Fieldset there would never resolve), and no reference type
 *   (the recursion nothing would catch).
 * - `block_type` — the Fields of a Blocks Field's Block Type.
 *
 * A Group's and a Fieldset's `children` sit in the Position the container
 * does — a Group at the root holds `root` Fields; only a container that says
 * otherwise (`childrenPosition`) changes it. The list grows additively.
 *
 * Replaces the `"attribute"` value of the old `FieldContext`, which mixed this
 * axis with the Consumer's; `attribute` is `reference_spec` now.
 */
export type Position = "root" | "row" | "reference_spec" | "block_type";

/**
 * A Spec a Field holds in its settings rather than in `children` — a Block
 * Type's Fields, a Reference Spec — and the Position its Fields sit in.
 * `segments` are the settings path relative to the Field:
 * `["settings", "allowed_blocks", 0, "fields"]`.
 */
export interface HeldSpec {
	segments: readonly (string | number)[];
	fields: Field[];
	position: Position;
}

/** Props passed to a field type's renderer component. */
export interface FieldProps<S = unknown> {
	field: Field<S>;
	readOnly?: boolean;
}

/**
 * Props passed to a field type's settings editor component.
 *
 * There is deliberately **no `lockedSettings` prop** (ADR-0011). A settings
 * editor that had to consult a list would be a settings editor that could
 * forget to — so the lock travels to the *controls* instead: each of
 * fieldkit's own (`BlueprintPicker`, `CapInput`, `PinModePicker`, the
 * Attribute list) takes the settings key it writes and asks about that key
 * itself, and an editor assembled from them honours the list without a line of
 * its own. A component that renders raw inputs instead will render an editable
 * control over a frozen setting; what it cannot do is write one — the config
 * panel restores every frozen key before applying an `onChange`.
 */
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
	 * Replaces the Fields the Field itself holds as `children` — the channel a
	 * settings editor needs when its type's Spec is authored *there* rather
	 * than in a setting: a Virtual Table's embedded Row Spec is `children`,
	 * exactly as a Group's rows are (ADR-0017), and `onChange` above can only
	 * write settings.
	 *
	 * Optional on the same terms as `onDrillIn`: a settings editor mounted
	 * outside the config panel has no way to write the Field itself, and must
	 * still render what the Field already declares.
	 */
	onChildrenChange?: (children: Field[]) => void;
	/**
	 * Opens the config panel's drill-in on one of the Field's own `children`,
	 * named by its Accessor — `onDrillIn`'s twin for a Spec that lives in
	 * `children` instead of in a settings key. A column is configured through
	 * the panel's incumbent drill-in, so no nested editor exists for it either.
	 */
	onDrillIntoChild?: (accessor: string) => void;
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
 * What a container type's `mintIds` needs from the shared machinery: whether
 * every `_id` is to be new, and a way into the record its child Fields
 * describe — the id-minting twin of {@link ComposeChildrenSchema} (ADR-0007,
 * ADR-0023).
 */
export interface MintIdsContext {
	/** `true` for paste and duplicate — every `_id` new, nested ones too.
	 * `false` for loading — only a missing, malformed or repeated `_id` is
	 * replaced. */
	fresh: boolean;
	/** Mints ids into a record `children` describe; the record itself when
	 * none was needed. */
	mintChildren: (children: Field[], record: unknown) => unknown;
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
	/**
	 * Mints `_id`s into a value of this type (ADR-0023), for a type whose
	 * value holds rows — or holds Fields that might. Returns the value itself
	 * when nothing was minted, so a caller can tell by `===`. Absent: the
	 * type's values hold no ids. Called by `mintMissingIds()` and
	 * `copyRows()`, never by a field component directly.
	 */
	mintIds?: (
		field: Field<S>,
		value: unknown,
		context: MintIdsContext,
	) => unknown;
	maxPerSpec?: number;
	/**
	 * The Consumers whose type picker offers this type (ADR-0022). Advice for
	 * pickers only. Absent: every Consumer's.
	 */
	consumers?: Consumer[];
	/**
	 * Where in a Spec a Field of this type may sit (ADR-0022), enforced by
	 * `validateSpec()`. Absent: `DEFAULT_POSITIONS` — the root and a Block
	 * Type, never a Row Spec or a Reference Spec, which a type has to be
	 * declared fit for.
	 */
	positions?: Position[];
	/**
	 * The Position of the Fields in this type's `children`, when it is not
	 * the Field's own — a Virtual Table's children are its Row Spec, `row`.
	 * Absent: a container is transparent, and its children sit where it does.
	 */
	childrenPosition?: Position;
	/**
	 * The Specs this type holds in its settings, so `validateSpec()` walks
	 * them as it walks `children` — each in its own Position. Only the plugin
	 * knows its settings' shape (ADR-0007): the shared walk asks this and
	 * learns nothing else. Read leniently: settings of the wrong shape hold no
	 * Spec, and the settings schema reports them.
	 */
	heldSpecs?: (field: Field<S>) => HeldSpec[];

	/**
	 * The settings this type accepts, as a **strict** Zod object: a key it
	 * does not declare is an error, never dropped (ADR-0018).
	 *
	 * Declaring one does two things. `validateSpec()` checks a Field's
	 * `settings` against it — reporting `unknown_setting` and
	 * `invalid_setting` at the exact path — and the type enters the
	 * **Catalogue**, the JSON both the npm package and the Go module embed,
	 * so Go's `ValidateSpec` checks the same settings the same way.
	 *
	 * A setting whose value is Unset (absent, `null`, `""`, `[]` or `{}`) is
	 * treated as absent before the schema sees it (ADR-0021), so every key
	 * is declared optional.
	 *
	 * Optional while the built-in types move over one ticket at a time; a
	 * type without one accepts any settings, as every type did before, and is
	 * not in the Catalogue.
	 */
	settingsSchema?: ZodTypeAny;
	/**
	 * The Catalogue facts about this type that are not its settings. Required
	 * by the Catalogue generator of every plugin that declares a
	 * `settingsSchema`, and read by nothing else.
	 */
	catalogue?: CatalogueFacts;
}

/**
 * What the Catalogue records about a Field Type besides its settings.
 */
export interface CatalogueFacts {
	/** The fieldkit version whose Catalogue first listed this type. Never
	 * changes once released (ADR-0019). */
	since: string;
	/** Whether a value of this type yields text — the types a `search`
	 * setting is valid on. */
	hasText: boolean;
	/** The settings keys that hold a Pin, each with the kind of Release it
	 * pins (ADR-0020). Empty for a type that pins nothing. */
	pins: readonly CataloguePin[];
}

/** One setting that holds a Pin, and what it pins. */
export interface CataloguePin {
	key: string;
	kind: string;
}
