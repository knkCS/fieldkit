import { ListTree } from "lucide-react";
import { z } from "zod";
import { BLUEPRINT_PIN } from "../../schema/blueprint-link";
import { TEXT_TYPE_PIN } from "../../schema/field-types/rich-text";
import type {
	FieldTypePlugin,
	HeldRecord,
	MintIdsContext,
} from "../../schema/plugin";
import {
	eachTreeNode,
	ReferenceTreeZodArray,
} from "../../schema/reference-plugin";
import { referenceValuesZodType } from "../../schema/reference-spec";
import { isRowId, mintId, rowIdSchema } from "../../schema/row-ids";
import type { Field } from "../../schema/types";
import { isPlainObject } from "../../schema/unset";
import { OutlineTreeCell, OutlineTreeField } from "../fields/outline-tree-view";

/**
 * `outline_tree`'s settings: two Pins (ADR-0020), and nothing else.
 *
 * - `blueprint` — the **Blueprint Release** declaring every Field a node can
 *   carry (core's `outline_tree`-typed Blueprint: a `kind` select naming the
 *   node types, and the Fields each kind shows). Resolve inlines it as the
 *   Field's `children`, as it inlines a Fieldset's.
 * - `text_type` — the **Text Type Release** stamped onto every rich-text
 *   document the outline holds (core's `text_type_id`). A Release Pin like
 *   `rich_text.text_type` (#216), not a bare id: the export service reads it
 *   from the Resolved Spec's `parts`, so a Blueprint Release carries the Text
 *   Type it was cut with and never follows a moving one. fieldkit stores it
 *   and never reads it.
 *
 * Core's retired `levels` is not a setting: the node types moved into the
 * Blueprint, so it is `unknown_setting`.
 */
export interface OutlineTreeSettings {
	blueprint?: string;
	text_type?: string;
}

/**
 * Where an outline node came from, for TOC generation (#286): `generated` by
 * contenthub's generator from a canonical tree, or added `manual`ly by an
 * editor. Absent says nothing — a node authored before generation existed.
 */
export const OUTLINE_NODE_ORIGINS = ["generated", "manual"] as const;

export type OutlineNodeOrigin = (typeof OUTLINE_NODE_ORIGINS)[number];

/**
 * One node of an outline (ADR-0023): its `_id`, unique across the whole tree;
 * its `values`, keyed by Accessor and checked against the Blueprint Release's
 * Fields — the node's kind among them; and its branch in `children`. The same
 * shape as a Reference without a target, so a node key never clashes with an
 * Accessor.
 *
 * Beside them, the keys contenthub's TOC generation reads and fieldkit only
 * holds (#286, core's `generated`, `overridden` and `source` — see
 * docs/knkcms-core-parity.md):
 *
 * - `origin` — {@link OutlineNodeOrigin}.
 * - `overridden` — an editor changed a generated node, so regenerating keeps
 *   it. `false` is a value (ADR-0021) and is stored as written; absent and
 *   `false` both read "not overridden", so a writer leaves it absent.
 * - `source` — the id of the Content the node stands for, which generation
 *   derives it from (core's provenance link). A bare id: it yields no edge.
 *
 * The node is strict: any other key is refused (`invalid_value` at the node).
 */
export interface OutlineNode {
	_id: string;
	values?: Record<string, unknown>;
	origin?: OutlineNodeOrigin;
	overridden?: boolean;
	source?: string;
	children?: OutlineNode[];
}

/**
 * The node Fields' Position: `reference_spec`. A node is filled in one at a
 * time in a drawer, as a Reference's values are, so what may describe it is
 * what a Reference Spec may hold — no Marker, no container, no tree inside a
 * node. A Position of its own can be split off later without refusing any
 * Spec this accepts, as long as it admits at least these types (ADR-0019).
 */
const NODE_POSITION = "reference_spec" as const;

/**
 * `outline_tree` — a publication's outline: a tree of nodes, each described by
 * one Blueprint Release it pins, which Resolve inlines as the Field's
 * `children` (ADR-0020). The node Fields are a Spec in the `reference_spec`
 * Position, whether authored or inlined; the outline itself sits at the root
 * of a Blueprint only.
 *
 * Its value is `OutlineNode[]`. Unresolved — no `children` — a node's
 * `values` are an opaque record. It has no text or edges of its own; its
 * nodes' values yield theirs, through `records`, as Go's `outlineTreeRecords`
 * does.
 *
 * Its editing UI is not ported yet (#267): the control shows how many nodes
 * the outline holds, and a Consumer attaches its own `fieldComponent`.
 */
export const outlineTreePlugin: FieldTypePlugin<OutlineTreeSettings> = {
	id: "outline_tree",
	name: "Outline tree",
	description: "A publication's outline: a tree of nodes of one Blueprint",
	icon: ListTree,
	category: "structural",

	fieldComponent: OutlineTreeField,
	cellComponent: OutlineTreeCell,

	toZodType(field: Field<OutlineTreeSettings>, composeChildren) {
		// `children` absent or null is an unresolved outline: its nodes' values
		// are then an opaque record.
		const values = referenceValuesZodType(
			field.children ?? undefined,
			composeChildren,
		);
		const node: z.ZodTypeAny = z.lazy(() =>
			z
				.object({
					_id: rowIdSchema,
					values,
					origin: z.enum(OUTLINE_NODE_ORIGINS).optional(),
					overridden: z.boolean().optional(),
					source: z.string().optional(),
					children: z.array(node).optional(),
				})
				.strict(),
		);
		const array = field.config.required
			? z.array(node).min(1, `${field.config.name} is required`)
			: z.array(node);
		// Every `_id` unique across the whole tree, as a Reference Tree's.
		return ReferenceTreeZodArray.with(array, { label: field.config.name });
	},

	settingsSchema: z
		.object({
			blueprint: z.string().optional(),
			text_type: z.string().optional(),
		})
		.strict(),

	catalogue: {
		since: "0.18.0",
		hasText: false,
		pins: [BLUEPRINT_PIN, TEXT_TYPE_PIN],
	},

	defaultSettings: {},

	defaultValue: () => [],

	mintIds: mintOutlineTree,
	records: outlineTreeRecords,

	consumers: ["blueprint"],
	positions: ["root"],
	childrenPosition: NODE_POSITION,
};

/**
 * An outline's records: each node's `values` against the Field's `children` —
 * the node Fields its Blueprint Release declares — at every level, for
 * `texts()` and `edges()`. Unresolved (no `children`), a node's values are
 * opaque and hold none. Go's `outlineTreeRecords`.
 */
export function outlineTreeRecords(
	field: Field<OutlineTreeSettings>,
	value: unknown,
): HeldRecord[] {
	const fields = field.children;
	if (!fields?.length) return [];
	const records: HeldRecord[] = [];
	eachTreeNode(value, (node, segments) => {
		if (!isPlainObject(node.values)) return;
		records.push({
			fields,
			record: node.values,
			segments: [...segments, "values"],
		});
	});
	return records;
}

/**
 * The `mintIds` of an outline (ADR-0023): every node at every level given an
 * `_id` where it needs one — unique across the whole tree — and its `values`
 * minted into against the node Fields. The value itself when nothing changed.
 */
function mintOutlineTree(
	field: Field<OutlineTreeSettings>,
	value: unknown,
	context: MintIdsContext,
): unknown {
	if (!Array.isArray(value)) return value;
	const seen = new Set<string>();
	const mintNodes = (nodes: unknown[]): unknown[] => {
		let changed = false;
		const next = nodes.map((node) => {
			if (!isPlainObject(node)) return node;
			let out: Record<string, unknown> = node;
			const id = node._id;
			if (context.fresh || !isRowId(id) || seen.has(id)) {
				out = { ...out, _id: mintId() };
			}
			seen.add(out._id as string);
			if (field.children?.length && out.values !== undefined) {
				const values = context.mintChildren(field.children, out.values);
				if (values !== out.values) out = { ...out, values };
			}
			if (Array.isArray(out.children)) {
				const children = mintNodes(out.children);
				if (children !== out.children) out = { ...out, children };
			}
			if (out !== node) changed = true;
			return out;
		});
		return changed ? next : nodes;
	};
	return mintNodes(value);
}
