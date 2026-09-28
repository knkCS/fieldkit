import { ListTree } from "lucide-react";
import {
	addIssueToContext,
	type ParseInput,
	ZodObject,
	type ZodRawShape,
	type ZodTypeAny,
	z,
} from "zod";
import {
	referenceDepthCeiling,
	referenceItemCap,
} from "../../schema/field-types/reference";
import type {
	ComposeChildrenSchema,
	FieldTypePlugin,
	HeldRecord,
	HeldSpec,
	MintIdsContext,
	SettingsRuleError,
	ValueContext,
	ValueEdge,
} from "../../schema/plugin";
import {
	type ReferenceSpecSettings,
	type ReferenceValuesSchema,
	referenceIdMinter,
	referenceSpecFor,
} from "../../schema/reference";
import {
	REFERENCE_SPEC_PIN,
	ReferenceTreeZodArray,
	referenceHeldSpecs,
	referenceSettingsRules,
	referenceSpecSettingsShape,
	referenceValuesSchema,
} from "../../schema/reference-plugin";
import { referenceValuesZodType } from "../../schema/reference-spec";
import { itemSegments, rowIdSchema } from "../../schema/row-ids";
import type { Field } from "../../schema/types";
import { isPlainObject } from "../../schema/unset";
import { ReferenceCell } from "../../table/cells/reference-cell";
import { UnportedField } from "../unported-field";

/**
 * What a node of a Manipulation Tree does with the Content it names — the
 * edge kind it yields in the Content Graph (contenthub ADR 0009):
 *
 * - `include` — pulls the Content into the Title, its `values` following the
 *   Field's Reference Spec as a Reference's do;
 * - `exclude` — leaves it out;
 * - `replace` — puts `with` in its place;
 * - `annotate` — keeps it, with `values` following the node-level Reference
 *   Spec, `annotation_spec` (contenthub ADR 0007's `redtitel`).
 *
 * What an intent *does* to a Title is contenthub's manipulation engine; fieldkit
 * holds only its shape. A later intent is a Catalogue that grows (ADR-0019): a
 * value once refused as `invalid_value` becomes valid.
 */
export const MANIPULATION_INTENTS = [
	"include",
	"exclude",
	"replace",
	"annotate",
] as const;

export type ManipulationIntent = (typeof MANIPULATION_INTENTS)[number];

/** The Content a `replace` node puts in its target's place: a Content id and
 * its Pin, as a Reference names one. */
export interface ManipulationReplacement {
	id: string;
	pin?: string;
}

/**
 * One node of a Manipulation Tree: a Reference (ADR-0008, amended) —
 * `_id`, `id`, `pin`, `values`, `children` — with its `intent`, and a
 * `replace` node's `with`. Every node carries an `_id` unique across the whole
 * tree (ADR-0023). `values` belong to `include` and `annotate` nodes alone;
 * `with` to `replace` nodes alone.
 */
export interface ManipulationNode {
	_id: string;
	/** The Content the node names: the one included, excluded, replaced or
	 * annotated. */
	id: string;
	intent: ManipulationIntent;
	/** The Release of `id` the node is pinned to; absent for the Release In
	 * Force. */
	pin?: string;
	/** An `include` node's Reference Spec values, or an `annotate` node's
	 * node-level Reference Spec values, keyed by Accessor. */
	values?: Record<string, unknown>;
	/** What a `replace` node puts in `id`'s place. */
	with?: ManipulationReplacement;
	children?: ManipulationNode[];
}

/**
 * A Manipulation Tree's settings: a Reference Field's — `blueprints` with
 * their linked Reference Specs, the embedded Reference Spec `spec`, and
 * `pin_mode` ({@link ReferenceSpecSettings}) — and the tree's two caps, plus:
 *
 * - `replacement_blueprints` — the Blueprints a `replace` node's `with` may
 *   name; advice for a picker, as `blueprints` is, never checked against a
 *   value (a value carries no Blueprint id).
 * - `annotation_spec` — the node-level Reference Spec: the Fields an
 *   `annotate` node's `values` follow, in the `reference_spec` Position.
 *   Embedded only; a per-Blueprint link, as `blueprints` has, would be a
 *   setting added beside it.
 */
export interface ManipulationTreeSettings extends ReferenceSpecSettings {
	replacement_blueprints?: string[];
	annotation_spec?: Field[];
	max_items?: number;
	max_depth?: number;
}

/** The segments of the node-level Reference Spec inside the settings. */
const ANNOTATION_SPEC = "annotation_spec";

function isIntent(value: unknown): value is ManipulationIntent {
	return (MANIPULATION_INTENTS as readonly unknown[]).includes(value);
}

function isFieldShaped(value: unknown): boolean {
	return isPlainObject(value) && isPlainObject(value.config);
}

/** The node-level Reference Spec as stored: every entry that is a Field. */
function annotationFields(
	settings: ManipulationTreeSettings | null | undefined,
): Field[] {
	const spec = settings?.annotation_spec;
	return Array.isArray(spec) ? (spec.filter(isFieldShaped) as Field[]) : [];
}

/** Whether a string names something: not blank. */
function named(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

/**
 * One node, checked by its intent on the raw node whatever else it gets wrong
 * — as Go checks it: a `ZodObject` subclass rather than a refinement, which Zod
 * skips once any key fails (the precedent is `TargetValuesZodObject`).
 *
 * - a `replace` node without `with` is `required` there; any other node with
 *   one is `invalid_value` there;
 * - an `include` node's `values` follow the Reference Spec its target
 *   chooses, an `annotate` node's the node-level Reference Spec, and an
 *   `exclude` or `replace` node holding any is `invalid_value` there.
 *
 * A node whose `intent` is not one of {@link MANIPULATION_INTENTS} is refused
 * at `intent`, and checked no further by intent — there is no branch to check
 * it against, as a Block naming no Block Type is not.
 */
class IntentZodObject<T extends ZodRawShape> extends ZodObject<T> {
	static of<T extends ZodRawShape>(
		object: ZodObject<T>,
		include: ReferenceValuesSchema,
		annotate: ZodTypeAny,
	): IntentZodObject<T> {
		const node = new IntentZodObject(object._def);
		node.include = include;
		node.annotate = annotate;
		return node;
	}

	include: ReferenceValuesSchema = z.unknown();
	annotate: ZodTypeAny = z.unknown();

	override _parse(input: ParseInput) {
		const result = super._parse(input);
		const { ctx } = this._processInputParams(input);
		const node = ctx.data;
		if (!isPlainObject(node) || !isIntent(node.intent)) return result;
		let failed = false;
		const issue = (path: string[], code: string, message: string) => {
			failed = true;
			addIssueToContext(ctx, {
				code: z.ZodIssueCode.custom,
				path,
				message,
				params: { code },
			});
		};
		if (node.intent === "replace" && node.with === undefined) {
			issue(["with"], "required", "A replace names what replaces it");
		} else if (node.intent !== "replace" && node.with !== undefined) {
			issue(["with"], "invalid_value", "Only a replace holds with");
		}
		const values = this.valuesOf(node);
		if (values === "none") {
			if (node.values !== undefined) {
				issue(["values"], "invalid_value", `An ${node.intent} holds no values`);
			}
		} else if (values) {
			const checked = values.safeParse(node.values);
			if (!checked.success) {
				failed = true;
				for (const each of checked.error.issues) {
					addIssueToContext(ctx, { ...each, path: ["values", ...each.path] });
				}
			}
		}
		if (!failed) return result;
		const dirty = <R extends { status: string }>(r: R): R =>
			r.status === "valid" ? { ...r, status: "dirty" } : r;
		return result instanceof Promise ? result.then(dirty) : dirty(result);
	}

	/** The schema a node's `values` follow; `"none"` for an intent that holds
	 * none; `undefined` when it cannot be chosen (a target-chosen Reference
	 * Spec, and no target). */
	private valuesOf(
		node: Record<string, unknown>,
	): ZodTypeAny | "none" | undefined {
		switch (node.intent) {
			case "include": {
				if (typeof this.include !== "function") return this.include;
				return typeof node.id === "string" && node.id
					? this.include({ id: node.id })
					: undefined;
			}
			case "annotate":
				return this.annotate;
			default:
				return "none";
		}
	}
}

/** A Manipulation Tree's node schema, `values` shaped per intent. */
function manipulationNodeSchema(
	include: ReferenceValuesSchema,
	annotate: ZodTypeAny,
): z.ZodType<ManipulationNode> {
	const node: z.ZodType<ManipulationNode> = z.lazy(
		() =>
			IntentZodObject.of(
				z.object({
					_id: rowIdSchema,
					id: z.string().min(1),
					intent: z.enum(MANIPULATION_INTENTS),
					pin: z.string().optional(),
					values: z.unknown(),
					with: z
						.object({ id: z.string().min(1), pin: z.string().optional() })
						.optional(),
					children: z.array(node).optional(),
				}),
				include,
				annotate,
			) as unknown as z.ZodType<ManipulationNode>,
	);
	return node;
}

/** Each object node of a tree value with its segments below the Field — its
 * `_id`, through `children` (ADR-0023) — in document order. */
function eachNode(
	value: unknown,
	visit: (node: Record<string, unknown>, segments: string[]) => void,
): void {
	const walk = (nodes: unknown[], prefix: string[]) => {
		const segments = itemSegments(nodes);
		nodes.forEach((node, index) => {
			if (!isPlainObject(node)) return;
			const at = [...prefix, segments[index]];
			visit(node, at);
			if (Array.isArray(node.children)) {
				walk(node.children, [...at, "children"]);
			}
		});
	};
	if (Array.isArray(value)) walk(value, []);
}

/** The edge a Content and its Pin make, of a kind. */
function edgeTo(
	kind: string,
	id: unknown,
	pin: unknown,
	segments: string[],
): ValueEdge | undefined {
	if (!named(id)) return undefined;
	const target: ValueEdge["target"] = { content: id };
	if (named(pin)) target.pin = pin;
	return { kind, target, segments };
}

/**
 * A Manipulation Tree's edges (contenthub ADR 0009): one per node, of its
 * intent's kind — `include`, `exclude`, `replace`, `annotate` — at the node's
 * path, carrying its target and Pin; and a `replace` node's `with`, the Content
 * the Title then holds in its target's place, as an `include` edge at the
 * node's path plus `with`. A node whose intent is none of the four yields
 * none. Go's `manipulationTreeEdges`.
 */
export function manipulationTreeEdges(value: unknown): ValueEdge[] {
	const edges: ValueEdge[] = [];
	eachNode(value, (node, segments) => {
		if (!isIntent(node.intent)) return;
		const own = edgeTo(node.intent, node.id, node.pin, segments);
		if (own) edges.push(own);
		if (node.intent === "replace" && isPlainObject(node.with)) {
			const replacement = edgeTo("include", node.with.id, node.with.pin, [
				...segments,
				"with",
			]);
			if (replacement) edges.push(replacement);
		}
	});
	return edges;
}

/** The Fields one node's `values` follow — `undefined` when not known. */
function nodeValuesSpec(
	node: Record<string, unknown>,
	settings: ManipulationTreeSettings | null | undefined,
	context?: ValueContext,
): Field[] | undefined {
	if (node.intent === "annotate") return annotationFields(settings);
	if (node.intent !== "include") return undefined;
	const blueprint =
		typeof node.id === "string"
			? context?.targetBlueprint?.(node.id)
			: undefined;
	return referenceSpecFor(settings, blueprint);
}

/** A Manipulation Tree's records: each `include` node's values against its
 * Reference Spec, each `annotate` node's against the node-level one — for
 * `texts()` and `edges()`. Go's `manipulationTreeRecords`. */
export function manipulationTreeRecords(
	field: Field<ManipulationTreeSettings>,
	value: unknown,
	context?: ValueContext,
): HeldRecord[] {
	const records: HeldRecord[] = [];
	eachNode(value, (node, segments) => {
		if (!isPlainObject(node.values)) return;
		const fields = nodeValuesSpec(node, field.settings, context);
		if (!fields?.length) return;
		records.push({
			fields,
			record: node.values,
			segments: [...segments, "values"],
		});
	});
	return records;
}

/** The `mintIds` of a Manipulation Tree (ADR-0023): every node at every level
 * given an `_id` where it needs one — unique across the whole tree — and its
 * `values` minted into where their Spec is known. Nothing else is normalised:
 * no stored shape of this type predates `_id`. The value itself when nothing
 * changed. */
export function mintManipulationTree(
	field: Field<ManipulationTreeSettings>,
	value: unknown,
	context: MintIdsContext,
): unknown {
	if (!Array.isArray(value)) return value;
	const ensureId = referenceIdMinter(context.fresh);
	const mintNodes = (nodes: unknown[]): unknown[] => {
		let changed = false;
		const next = nodes.map((node) => {
			if (!isPlainObject(node)) return node;
			let minted: Record<string, unknown> = node;
			const id = ensureId(node._id);
			if (id !== undefined) minted = { ...minted, _id: id };
			const spec = nodeValuesSpec(node, field.settings);
			if (spec?.length && minted.values !== undefined) {
				const values = context.mintChildren(spec, minted.values);
				if (values !== minted.values) minted = { ...minted, values };
			}
			if (Array.isArray(minted.children)) {
				const children = mintNodes(minted.children);
				if (children !== minted.children) minted = { ...minted, children };
			}
			if (minted !== node) changed = true;
			return minted;
		});
		return changed ? next : nodes;
	};
	return mintNodes(value);
}

/** The Specs a Manipulation Tree holds in its settings: a Reference Field's
 * (`spec`, each linked one) and the node-level `annotation_spec` — all in the
 * `reference_spec` Position (ADR-0022). */
export function manipulationTreeHeldSpecs(field: Field): HeldSpec[] {
	const held = referenceHeldSpecs(field);
	const spec = isPlainObject(field.settings)
		? field.settings[ANNOTATION_SPEC]
		: undefined;
	if (Array.isArray(spec) && spec.length > 0 && spec.every(isFieldShaped)) {
		held.push({
			segments: ["settings", ANNOTATION_SPEC],
			fields: spec as Field[],
			position: "reference_spec",
		});
	}
	return held;
}

/** A Reference Field's settings rules, and a node-level Reference Spec that is
 * a list but not of Fields — `invalid_setting` at the list. */
export function manipulationTreeSettingsRules(
	field: Field,
): SettingsRuleError[] {
	const errors = referenceSettingsRules(field);
	const spec = isPlainObject(field.settings)
		? field.settings[ANNOTATION_SPEC]
		: undefined;
	if (Array.isArray(spec) && spec.length > 0 && !spec.every(isFieldShaped)) {
		errors.push({
			segments: ["settings", ANNOTATION_SPEC],
			code: "invalid_setting",
			message: "The node-level Reference Spec is not a list of Fields",
		});
	}
	return errors;
}

/**
 * `manipulation_tree` — a Title's composition (contenthub ADRs 0007, 0009): a
 * Reference Tree whose every node says what it does with the Content it names
 * — include, exclude, replace or annotate ({@link MANIPULATION_INTENTS}).
 * It shares the Reference Tree's rules: every node carries an `_id` unique
 * across the tree, `max_items` counts every node, `max_depth` the levels, and
 * Compare and Merge go per node by `_id`, a node's parent and position counting
 * as its fields (ADR-0023).
 *
 * Its data contract only. Contenthub's manipulation engine — expanding an
 * included Content's TOC, applying the intents — stays in contenthub. The
 * editing UI is not ported: {@link UnportedField} shows the value read-only,
 * and a Consumer attaches its own `fieldComponent` by spreading the plugin
 * (`{ ...manipulationTreePlugin, fieldComponent: Mine }`).
 */
export const manipulationTreePlugin: FieldTypePlugin<ManipulationTreeSettings> =
	{
		id: "manipulation_tree",
		name: "Manipulation tree",
		description: "What a Title includes, leaves out, replaces and annotates",
		icon: ListTree,
		category: "reference",

		fieldComponent:
			UnportedField as FieldTypePlugin<ManipulationTreeSettings>["fieldComponent"],
		// A count of nodes at every level, as a Reference Tree's cell counts
		// References.
		cellComponent:
			ReferenceCell as FieldTypePlugin<ManipulationTreeSettings>["cellComponent"],

		toZodType(
			field: Field<ManipulationTreeSettings>,
			composeChildren?: ComposeChildrenSchema,
			context?: ValueContext,
		) {
			const label = field.config.name;
			const node = manipulationNodeSchema(
				referenceValuesSchema(field.settings, composeChildren, context),
				referenceValuesZodType(
					annotationFields(field.settings),
					composeChildren,
				),
			);
			const array = field.config.required
				? z.array(node).min(1, `${label} is required`)
				: z.array(node);
			return ReferenceTreeZodArray.with(array, {
				label,
				maxItems: referenceItemCap(field.settings),
				depthCeiling: referenceDepthCeiling(field.settings),
			});
		},

		settingsSchema: z
			.object({
				...referenceSpecSettingsShape,
				replacement_blueprints: z.array(z.string()).optional(),
				annotation_spec: z.array(z.unknown()).optional(),
				max_items: z.number().int().nonnegative().optional(),
				max_depth: z.number().int().nonnegative().optional(),
			})
			.strict(),

		// No text of its own — a node's is its values', reached through
		// `records`. Each `blueprints` entry's linked Reference Spec is a Pin,
		// as a Reference Field's is.
		catalogue: { since: "0.18.0", hasText: false, pins: [REFERENCE_SPEC_PIN] },

		defaultSettings: { blueprints: [], pin_mode: "none", spec: [] },

		defaultValue: () => [],

		mintIds: mintManipulationTree,
		edges: (_field, value) => manipulationTreeEdges(value),
		records: manipulationTreeRecords,
		settingsRules: manipulationTreeSettingsRules,
		heldSpecs: manipulationTreeHeldSpecs,

		consumers: ["blueprint"],
		positions: ["root"],
	};
