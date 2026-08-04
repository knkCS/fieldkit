import { Link2 } from "lucide-react";
import { z } from "zod";
import { ReferenceSettingsEditor } from "../../editor/field-settings/reference-settings";
import { ReferenceField } from "../../renderer/fields/reference-field";
import { ReferenceCell } from "../../table/cells/reference-cell";
import type {
	FieldContext,
	FieldTypeCategory,
	FieldTypePlugin,
} from "../plugin";
import type { PinMode } from "../reference";
import { referenceTreeSchemaWith } from "../reference";
import { attributesZodType } from "../reference-attributes";
import { countReferences, referencesPastDepth } from "../reference-tree";
import type { Field } from "../types";

export interface ReferenceSettings {
	/** The Blueprints this Field may point at. Empty or absent means the
	 * Adapter decides — fieldkit has no notion of a Blueprint kind
	 * (ADR-0002). */
	blueprints?: string[];
	/**
	 * At most this many References, counted over the **flattened** tree — every
	 * Reference at every level, since a nested child is as real as a root.
	 *
	 * A pure cap, never a change of shape: `max_items: 1` still stores a
	 * one-element array, because Single Reference is its own Field Type
	 * (ADR-0005).
	 *
	 * Absent is no cap. `0` is a cap of zero and is **not** the same thing —
	 * read it through {@link referenceItemCap} rather than with `?? 0`, which
	 * is the reading that makes an uncapped Field refuse to add anything.
	 */
	max_items?: number;
	/**
	 * How many **levels** of References the tree may hold, roots being level 1.
	 *
	 * A count, not an index: `max_depth: 1` is a flat list and forbids nesting
	 * altogether, `max_depth: 2` allows roots with children but no
	 * grandchildren. That is the dialect every other `max_*` setting in this
	 * package speaks, and it is the one knkCMS core's `reference` speaks too
	 * — core clamps its drag to `max_depth - 1` over 0-based depths.
	 *
	 * The depth *index* the tree model works in is therefore one less; the
	 * conversion happens once, in {@link referenceDepthCeiling}, and both the
	 * Schema and the drag clamp read it from there.
	 *
	 * Absent is no ceiling, and the tree nests as far as an Author drags it.
	 */
	max_depth?: number;
	/**
	 * Whether this Field fixes its References to a Release, to a Version, or
	 * tracks the newest Version.
	 *
	 * Absent reads as `"none"`, so a Spec authored before pinning existed keeps
	 * behaving as it did. What the Pin *points at* is settled here and nowhere
	 * else — the value stores a bare target id (ADR-0008) — which is why
	 * changing this invalidates every stored Pin at once instead of leaving
	 * some of them stale.
	 */
	pin_mode?: PinMode;
	/**
	 * The Attribute Spec: the Fields every Reference this Field holds carries
	 * about the pointing itself — the page a citation appears on, the role a
	 * credit names.
	 *
	 * Ordinary Fields, so "page" can be a number and "role" a select and either
	 * can be required, and the values are stored keyed by Accessor rather than
	 * positionally as knkCMS core does it.
	 *
	 * It lives here rather than in `children`, following the Blocks precedent —
	 * and it inherits ADR-0007's boundary verbatim. `src/schema/reference-
	 * attributes.ts` is where that boundary and what it costs are written down.
	 */
	attributes?: Field[];
}

/**
 * A cap as the settings actually stored it, or `undefined` when none was.
 *
 * Only a real, finite number is a cap. `undefined`, `null` and anything that
 * is not a `number` are all "unset" — a Spec's settings are free-form JSON from
 * a Consumer, so a missing key and a null one mean the same thing and neither
 * means zero. **Zero is a cap of zero**, which is why this cannot be written as
 * `settings?.max_items ?? 0`: that reading turns every uncapped Field into one
 * capped at nothing, which is precisely the bug knkCMS core's add affordance
 * has today.
 */
function storedCap(raw: unknown): number | undefined {
	return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

/**
 * The `max_items` cap a Field sets, or `undefined` when it sets none.
 *
 * The one place that decides what "unset" means, so the Schema that blocks
 * submit and the add affordance that stops an Author reaching the cap cannot
 * disagree about whether a Field has one. Exported because a Consumer building
 * its own control around `ReferenceTree` needs the same answer (ADR-0010).
 */
export function referenceItemCap(
	settings: ReferenceSettings | null | undefined,
): number | undefined {
	return storedCap(settings?.max_items);
}

/**
 * The deepest depth **index** a Reference may sit at, roots being 0 — or
 * `undefined` when the Field sets no `max_depth`.
 *
 * This is the whole conversion between the two dialects, in one place:
 * `max_depth` counts levels and the tree model indexes them, so a Field
 * allowing `n` levels has a ceiling of `n - 1`. `max_depth: 1` therefore
 * yields 0, which forbids nesting; `projectDropDepth` and the Schema both take
 * the result as-is.
 *
 * `max_depth: 0` yields `-1`, a ceiling no Reference can be within. Degenerate
 * rather than special: it says "no levels of References", exactly as
 * `max_items: 0` says "no References", and it is reported rather than quietly
 * read as unset.
 */
export function referenceDepthCeiling(
	settings: ReferenceSettings | null | undefined,
): number | undefined {
	const levels = storedCap(settings?.max_depth);
	return levels === undefined ? undefined : levels - 1;
}

/** English for a count, so one Reference is not "1 references". */
function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

/**
 * What a Consumer says about a reference-shaped Field Type of its own.
 *
 * Only the catalogue entry — an id, a name, and how the type may be used.
 * Everything a Reference Field *does* comes from fieldkit and is deliberately
 * not overridable here. A Consumer wanting a different control writes a plugin
 * by hand around `ReferenceTree` from `/renderer`, which renders and reorders
 * rows and nothing else: resolving names and offering a way to add are that
 * Consumer's own, since only its Adapter can do either.
 */
export interface ReferencePluginOptions {
	/**
	 * The `field_type` a Spec stores, and the id a Consumer's backend addresses
	 * the type by — which for `toc_reference` is precisely why the type belongs
	 * to that Consumer rather than to fieldkit (ADR-0010).
	 */
	id: string;
	/** What the type picker calls it. */
	name: string;
	/** The line under the name in the type picker. */
	description?: string;
	/** A Lucide icon, as every plugin's is (CLAUDE.md, Design Principles). */
	icon?: FieldTypePlugin["icon"];
	/** Defaults to `"reference"` — the category a reference-shaped type is in. */
	category?: FieldTypeCategory;
	/**
	 * At most this many Fields of this type in one Spec.
	 *
	 * The reason the machinery exists: `toc_reference` is one per Blueprint,
	 * because core expands a publication subtree from *the* Field of that type.
	 * Absent means no limit, as it does for every built-in type.
	 */
	maxPerSpec?: number;
	/** Where the type may be used. Defaults to everywhere the built-in
	 * `reference` may be used. */
	availableIn?: FieldContext[];
	/**
	 * Settings a new Field of this type starts with, merged **over** the
	 * reference defaults — so naming Blueprints does not silently turn pinning
	 * on, and a later default fieldkit adds reaches Consumer types too.
	 */
	defaultSettings?: ReferenceSettings;
}

/**
 * Mints a reference-shaped Field Type: fieldkit's Reference Tree under a
 * Consumer's own id.
 *
 * The catalogue stays generic, but it exports the parts rather than leaving
 * each Consumer to assemble a tree from nothing (ADR-0010, extending ADR-0002).
 * The tree, the browse drawer, the count cell, the settings editor and the
 * Schema are all the built-in ones, so a Consumer type cannot drift from
 * `reference` — `reference` itself is minted here.
 *
 * The Schema is recursive because the value is (ADR-0008): a nested branch has
 * to survive a parse, or a drop that nests on screen would submit a flat list.
 * Both caps are enforced in it, so an import or an API write is checked on the
 * same terms a form is — and a Consumer-minted type cannot quietly be the
 * unenforced one.
 */
export function createReferencePlugin({
	id,
	name,
	description = "Link to other content items",
	icon = Link2,
	category = "reference",
	maxPerSpec,
	availableIn = ["blueprint", "task", "form"],
	defaultSettings,
}: ReferencePluginOptions): FieldTypePlugin<ReferenceSettings> {
	return {
		id,
		name,
		description,
		icon,
		category,

		settingsComponent: ReferenceSettingsEditor,
		fieldComponent: ReferenceField,
		cellComponent: ReferenceCell,

		// The Attribute Spec is composed here rather than by the shared builder,
		// which is the whole of ADR-0007: a plugin reaches into its own settings
		// and nothing else does. Composing is not walking, so the boundary is
		// unmoved — no duplicate-Accessor check, no empty-name check and no
		// Fieldset resolution reaches an Attribute Field. See
		// `../reference-attributes.ts`.
		//
		// Both caps are checked here too, and for the same reason the Attributes
		// are: only this plugin knows what its own settings mean. Minted types
		// get all of it, which is the factory's whole promise — a Consumer's
		// reference-shaped type cannot drift from `reference` without the drift
		// being deliberate.
		toZodType(field: Field<ReferenceSettings>, composeChildren) {
			const label = field.config.name;
			const array = z.array(
				referenceTreeSchemaWith(
					attributesZodType(field.settings?.attributes, composeChildren),
				),
			);
			const tree = field.config.required
				? array.min(1, `${label} is required`)
				: array;

			// Neither cap goes through `.max()`, because neither is a fact about
			// the array: `max_items` counts the whole flattened tree, and
			// `max_depth` has to name *which* Reference broke it. Stored data is
			// held to exactly these rules — a Spec whose caps were never enforced
			// can therefore start blocking submit on data that saved fine before,
			// which is the point. Nothing is ever truncated or re-nested to fit:
			// the value is reported, never repaired.
			return tree.superRefine((references, ctx) => {
				const items = referenceItemCap(field.settings);
				if (items !== undefined && countReferences(references) > items) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						// No path of its own: an over-full tree is the Field's
						// problem, not any one Reference's, and the Field's own path
						// is where a form can show it.
						message: `${label} holds at most ${plural(items, "reference", "references")}`,
					});
				}

				const ceiling = referenceDepthCeiling(field.settings);
				if (ceiling === undefined) return;
				const levels = ceiling + 1;
				for (const path of referencesPastDepth(references, ceiling)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path,
						message: `${label} nests at most ${plural(levels, "level", "levels")} deep`,
					});
				}
			});
		},

		// A new Field tracks the newest Version: pinning is a deliberate choice
		// an Author makes, and it costs a second step every time a Reference is
		// added. It declares no Attributes either — a Reference that carries
		// nothing about the pointing is the ordinary case. Built per mint, so two
		// types minted with no `blueprints` of their own never share the empty
		// array. (A Consumer that hands the same array to two mints shares it, as
		// it would with any object it passes.)
		defaultSettings: {
			blueprints: [],
			pin_mode: "none",
			attributes: [],
			...defaultSettings,
		},

		// A fresh array per call — an empty list is what the control renders, and
		// a shared one would be mutated across forms.
		defaultValue: () => [],

		maxPerSpec,
		availableIn,
	};
}

/**
 * A Reference Tree: an ordered list of References, each of which may hold
 * References of its own.
 *
 * Minted with nothing overridden, so the factory's defaults above simply *are*
 * this plugin. That is the point: a Consumer's reference-shaped type is the
 * same object with a different catalogue entry, and cannot drift from this one
 * without the drift being deliberate.
 */
export const referencePlugin: FieldTypePlugin<ReferenceSettings> =
	createReferencePlugin({ id: "reference", name: "Reference" });
