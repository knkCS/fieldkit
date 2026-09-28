import { Link2 } from "lucide-react";
import { z } from "zod";
import { ReferenceSettingsEditor } from "../../editor/field-settings/reference-settings";
import { ReferenceField } from "../../renderer/fields/reference-field";
import { ReferenceReadValue } from "../../renderer/fields/reference-read";
import { ReferenceCell } from "../../table/cells/reference-cell";
import type {
	Consumer,
	FieldTypeCategory,
	FieldTypePlugin,
	Position,
} from "../plugin";
import type { ReferenceSpecSettings } from "../reference";
import { referenceTreeSchemaWith } from "../reference";
import {
	mintReferenceTree,
	REFERENCE_SPEC_PIN,
	ReferenceTreeZodArray,
	referenceHeldSpecs,
	referenceSettingsRules,
	referenceSpecSettingsShape,
	referenceTreeEdges,
	referenceTreeRecords,
	referenceValuesSchema,
} from "../reference-plugin";
import type { Field } from "../types";

/**
 * A Reference Field's settings (ADR-0008, amended): `blueprints`, the Reference
 * Spec and `pin_mode` are every reference-shaped type's
 * ({@link ReferenceSpecSettings}); the two caps are the tree's.
 *
 * - `blueprints` — the Blueprints this Field may point at, each with an
 *   optional `spec_blueprint`: a Blueprint Release whose Fields **replace** the
 *   embedded `spec` for References to that Blueprint, never merged with it.
 *   Empty or absent means the Adapter decides (ADR-0002).
 * - `spec` — the embedded Reference Spec: the Fields every Reference fills in
 *   about the pointing itself — the page a citation appears on, the role a
 *   credit names — stored in its `values`, keyed by Accessor. It lives here
 *   rather than in `children`, following the Blocks precedent, and inherits
 *   ADR-0007's boundary (`src/schema/reference-spec.ts`).
 * - `pin_mode` — `"release"` fixes each Reference to a Release of its target;
 *   absent reads as `"none"`, the Release In Force. What the Pin *points at* is
 *   settled here and nowhere else — the value stores a bare Release id — which
 *   is why changing this invalidates every stored Pin at once.
 */
export interface ReferenceSettings extends ReferenceSpecSettings {
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
	/** The Consumers whose type picker offers the type (ADR-0022). Defaults to
	 * every Consumer, as the built-in `reference` is offered. */
	consumers?: Consumer[];
	/** Where in a Spec a Field of the type may sit (ADR-0022). Defaults to
	 * where the built-in `reference` may: the root and a Block Type — never a
	 * Row Spec, which holds one flat value per cell, and never a Reference
	 * Spec, the recursion nothing would catch. */
	positions?: Position[];
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
	consumers = ["blueprint", "task", "form"],
	positions = ["root", "block_type"],
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
		// Minted types get read mode too, which is the point of putting it on
		// the plugin: a `field_type === "reference"` check in read mode's own
		// code could never have covered a Consumer's own id (ADR-0010), so a
		// minted type would have read as a count while `reference` read as a
		// tree.
		readComponent: ReferenceReadValue,

		// The Reference Spec is composed here rather than by the shared builder,
		// which is the whole of ADR-0007: a plugin reaches into its own settings
		// and nothing else does. `validateSpec()` walks it only because this
		// plugin names it (`heldSpecs` below). See `../reference-spec.ts`.
		//
		// Both caps, and every `_id` being unique across the whole tree
		// (ADR-0023), are checked here too, and for the same reason the values
		// are: only this plugin knows what its own settings mean. Minted types
		// get all of it, which is the factory's whole promise — a Consumer's
		// reference-shaped type cannot drift from `reference` without the drift
		// being deliberate.
		toZodType(field: Field<ReferenceSettings>, composeChildren, context) {
			const label = field.config.name;
			const node = referenceTreeSchemaWith(
				referenceValuesSchema(field.settings, composeChildren, context),
			);
			const array = field.config.required
				? z.array(node).min(1, `${label} is required`)
				: z.array(node);

			// Neither cap goes through `.max()`, because neither is a fact about
			// the array: `max_items` counts the whole flattened tree, and
			// `max_depth` has to name *which* Reference broke it. Both are checked
			// on the raw value whatever else a node gets wrong, as Go checks them.
			// Stored data is held to exactly these rules — a Spec whose caps were
			// never enforced can therefore start blocking submit on data that
			// saved fine before, which is the point. Nothing is ever truncated or
			// re-nested to fit: the value is reported, never repaired.
			return ReferenceTreeZodArray.with(array, {
				label,
				maxItems: referenceItemCap(field.settings),
				depthCeiling: referenceDepthCeiling(field.settings),
			});
		},

		// A new Field tracks the Release In Force: pinning is a deliberate
		// choice an Author makes, and it costs a second step every time a
		// Reference is added. Its Reference Spec is empty too — a Reference
		// that carries nothing about the pointing is the ordinary case. Built
		// per mint, so two types minted with no `blueprints` of their own never
		// share the empty array. (A Consumer that hands the same array to two
		// mints shares it, as it would with any object it passes.)
		defaultSettings: {
			blueprints: [],
			pin_mode: "none",
			spec: [],
			...defaultSettings,
		},

		// The settings every reference-shaped type declares, and the tree's two
		// caps. Minted types declare them too, so `validateSpec()` checks a
		// Consumer's type as it checks `reference`; only the built-in ones are
		// in the Catalogue (`scripts/catalogue.ts` reads the built-ins).
		settingsSchema: z
			.object({
				...referenceSpecSettingsShape,
				max_items: z.number().int().nonnegative().optional(),
				max_depth: z.number().int().nonnegative().optional(),
			})
			.strict(),

		// A Reference's text is its values', read against its Reference Spec;
		// the Field yields none of its own. Each `blueprints` entry's linked
		// Reference Spec is a Blueprint Pin, resolved into that entry's `spec`.
		catalogue: { since: "0.18.0", hasText: false, pins: [REFERENCE_SPEC_PIN] },

		// Every node carries an `_id` (ADR-0023), minted for loaded, pasted and
		// duplicated trees — and a legacy node is brought into the current
		// shape on the way (`normalizeReference`), so a stored value converges
		// on the next save without making the form dirty.
		mintIds: mintReferenceTree,

		// One `reference` edge per node, carrying its target and Pin.
		edges: (_field, value) => referenceTreeEdges(value),

		// Each node's `values`, against its Reference Spec, for `texts()` and
		// `edges()`.
		records: referenceTreeRecords,

		// Two `blueprints` entries naming one Blueprint, and a Reference Spec
		// that is not a list of Fields.
		settingsRules: referenceSettingsRules,

		// A fresh array per call — an empty list is what the control renders, and
		// a shared one would be mutated across forms.
		defaultValue: () => [],

		maxPerSpec,
		consumers,
		positions,

		// The Reference Spec — embedded, and each linked one once resolved — is
		// a Spec in `reference_spec` Position, so `validateSpec()` walks it as
		// it walks `children`, and every rule — the Position check among them —
		// reaches its Fields (ADR-0022). See `../reference-spec.ts`.
		heldSpecs: referenceHeldSpecs,
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
