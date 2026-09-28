import { FileCog } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { FieldsetField } from "../../renderer/fields/fieldset-field";
import type {
	CataloguePin,
	CellProps,
	FieldProps,
	FieldTypePlugin,
} from "../../schema/plugin";
import { mintRowIds, RowZodArray, rowIdSchema } from "../../schema/row-ids";
import type { Field } from "../../schema/types";
import { GroupCell } from "../../table/cells/group-cell";

/** The kind of a Pin naming a Typesetting Instruction Set Release:
 * `ti_overlay`'s `ti_set`, resolved into the Resolved Spec's `parts.ti_set`
 * (ADR-0020) and read by nothing in TS. */
export const TI_SET_KIND = "ti_set";

/** The setting holding a ti_overlay Field's TI Set Pin. */
export const TI_SET_PIN: CataloguePin = { key: "ti_set", kind: TI_SET_KIND };

/** How many Unicode code points an inline anchor keeps on either side of its
 * position — knkeditor's `InlineAnchorWindow`. */
export const INLINE_ANCHOR_WINDOW = 20;

export interface TiOverlaySettings {
	/** The Typesetting Instruction Set Release this Field's commands come
	 * from: a Pin (ADR-0020), resolved into the Resolved Spec's
	 * `parts.ti_set`. Go's `ValidateResolvedValue` checks each entry's
	 * `command` against it; nothing in TS reads it. */
	ti_set?: string;
}

/** Where a typesetting instruction sits: knkeditor's inline anchor. */
export interface InlineAnchor {
	/** The id of the innermost text block holding the position. */
	node: string;
	/** Unicode code points into that block's text. */
	offset: number;
	/** Up to 20 code points of the block's text ending at `offset`. Absent
	 * when there are none — Unset is stored as absent (ADR-0021), so a host
	 * handing the anchor to knkeditor supplies `""`. */
	before?: string;
	/** Up to 20 code points of the block's text starting at `offset`;
	 * absent when there are none. */
	after?: string;
}

/** One typesetting instruction. Its id is its `_id` (ADR-0023): the row id
 * every row array carries, and the only one it has. */
export interface TiOverlayEntry {
	_id: string;
	anchor: InlineAnchor;
	/** A code of the pinned TI Set. */
	command: string;
	params?: Record<string, string>;
	source: "editor" | "oasys";
	notes?: string;
}

/** A ti_overlay value: the flattened list of entries (contenthub ADR 0012). */
export interface TiOverlayValue {
	entries: TiOverlayEntry[];
}

/** A string of at most `max` Unicode code points — what knkeditor counts —
 * not UTF-16 code units, as `.max()` would. */
function codePoints(max: number) {
	return z.string().refine((s) => [...s].length <= max, {
		message: `At most ${max} code points`,
		params: { code: "too_big", maximum: max },
	});
}

/** knkeditor's inline anchor, `{node, offset, before, after}`, validated by
 * its shape alone: resolving it against a document is knkeditor's. Strict,
 * so the old editor shape (`blockId`, `charOffsetInBlock`, `fingerprint`)
 * is refused. */
export const inlineAnchorSchema = z
	.object({
		node: z.string().min(1),
		offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		before: codePoints(INLINE_ANCHOR_WINDOW).optional(),
		after: codePoints(INLINE_ANCHOR_WINDOW).optional(),
	})
	.strict();

/** One entry. Strict: core's stored `status` and `id` are gone. */
export const tiOverlayEntrySchema = z
	.object({
		_id: rowIdSchema,
		anchor: inlineAnchorSchema,
		command: z.string().min(1),
		params: z.record(z.string()).optional(),
		source: z.enum(["editor", "oasys"]),
		notes: z.string().optional(),
	})
	.strict();

/**
 * The entries' Fields, as the renderer's stopgap edits them: a Group of
 * entries, each an anchor record beside its command, source and notes. Not a
 * Spec anyone authors — the value's shape is `toZodType`'s. (Go compares and
 * merges entries by a list of its own, go/publishing/ti_overlay.go.)
 */
function field(
	field_type: string,
	api_accessor: string,
	name: string,
	extra: Partial<Field> = {},
): Field {
	return {
		field_type,
		config: { name, api_accessor, required: false, instructions: "" },
		system: false,
		...extra,
	} as Field;
}

const ENTRY_FIELDS: Field[] = [
	field("fieldset", "anchor", "Anchor", {
		children: [
			field("text", "node", "Node"),
			field("number", "offset", "Offset"),
			field("text", "before", "Before"),
			field("text", "after", "After"),
		],
	}),
	field("text", "command", "Command"),
	field("select", "source", "Source", {
		settings: { options: { editor: "Editor", oasys: "OASYS" } },
	}),
	field("textarea", "notes", "Notes"),
];

/**
 * The editing UI until the publishing types' UI is ported (#267): the
 * built-in Fieldset and Group, over the entries' Fields. `params` has no
 * built-in editor — its keys are the command's — so it is kept as it is.
 */
export function TiOverlayField(props: FieldProps<TiOverlaySettings>) {
	const { field: overlay } = props;
	const record = useMemo(
		() =>
			({
				...overlay,
				field_type: "fieldset",
				settings: {},
				children: [
					field("group", "entries", "Entries", { children: ENTRY_FIELDS }),
				],
			}) as Field,
		[overlay],
	);
	return <FieldsetField {...props} field={record as Field<never>} />;
}
TiOverlayField.displayName = "TiOverlayField";

/** The table cell: the number of entries, as a Group's cell counts rows. */
export function TiOverlayCell(props: CellProps<TiOverlaySettings>) {
	const { value } = props;
	const entries =
		value !== null && typeof value === "object" && !Array.isArray(value)
			? (value as { entries?: unknown }).entries
			: undefined;
	return (
		<GroupCell
			{...(props as unknown as CellProps<never>)}
			value={Array.isArray(entries) ? entries : undefined}
		/>
	);
}
TiOverlayCell.displayName = "TiOverlayCell";

/**
 * `ti_overlay` — a Title's typesetting instructions (contenthub ADR 0012):
 * `{entries: [...]}`, each entry an `_id` (its id, ADR-0023), knkeditor's
 * inline anchor, a command of the pinned TI Set, its params, its source
 * (`editor` or `oasys`) and notes. Core's `published`, `drafts`, `label`,
 * `base_revision_id`, `oasys_response` and each entry's stored `status` are
 * gone: the object and each entry are strict, so a value holding one is
 * `invalid_value`.
 *
 * Its TI Set is a Pin (`ti_set`), carried in the Resolved Spec's `parts`.
 * TS validates the value's shape; that each `command` is a code of the
 * pinned Set is checked by Go's `ValidateResolvedValue` alone
 * (`unknown_command`), which holds the Set.
 *
 * It has no text and yields no edges, and sits only at the root.
 */
export const tiOverlayPlugin: FieldTypePlugin<TiOverlaySettings> = {
	id: "ti_overlay",
	name: "Typesetting instructions",
	description: "Typesetting instructions anchored in a Title's text",
	icon: FileCog,
	category: "structural",

	fieldComponent: TiOverlayField,
	cellComponent: TiOverlayCell,

	toZodType(_field: Field<TiOverlaySettings>) {
		return z
			.object({ entries: RowZodArray.of(z.array(tiOverlayEntrySchema)) })
			.strict();
	},

	settingsSchema: z.object({ ti_set: z.string().optional() }).strict(),

	catalogue: { since: "0.18.0", hasText: false, pins: [TI_SET_PIN] },

	defaultSettings: {},

	defaultValue: () => ({ entries: [] }),

	// Each entry is a row (ADR-0023): minted as a Group's rows are.
	mintIds(_field, value, context) {
		if (value === null || typeof value !== "object" || Array.isArray(value))
			return value;
		const record = value as Record<string, unknown>;
		const entries = mintRowIds(record.entries, context, () => undefined);
		return entries === record.entries ? value : { ...record, entries };
	},

	consumers: ["blueprint"],
	positions: ["root"],
};
