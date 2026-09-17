// src/schema/virtual-table-row-spec.ts
// The `virtual_table` plugin pulls in its React components, so its settings
// type is imported type-only — this module stays free of the renderer at
// runtime, as `resolve-spec.ts` does for Fieldset.
import type { VirtualTableSettings } from "./field-types/virtual-table";
import type { Field } from "./types";

/**
 * How a Virtual Table Field declares its Row Spec (ADR-0017).
 *
 * - `linked` — `settings.blueprint` names a Blueprint, resolved through the
 *   blueprint adapter exactly as a Fieldset's is (ADR-0003), so several
 *   Virtual Table Fields can share one Row Spec.
 * - `embedded` — the Field's own `children` hold the Row Spec, as a Group's do.
 * - `both` / `neither` — the two states `validateSpec()` refuses. A Field has
 *   exactly one Row Spec.
 */
export type VirtualTableRowSpecKind =
	| "linked"
	| "embedded"
	| "both"
	| "neither";

/**
 * The Field Types a Row Spec column may be (ADR-0017).
 *
 * Flat value fields only: each column must fit a table cell and a row drawer,
 * and a Consumer's row validation stays one level deep. So no Marker — there
 * is no Tab or Card inside a row — and no container: a Group, Fieldset,
 * Blocks, Array, List or a nested Virtual Table would all put a second level
 * under a single cell.
 *
 * `media` and `single_reference` are in because both hold one flat value a
 * cell can show; the Reference *Tree* type is not, because it holds many and
 * nests them. `rich_text` and `code` are out for the cell's sake — a column is
 * one row of height.
 *
 * A list of ids in a virtual-table module rather than a capability flag on
 * every plugin: this is one Field Type's rule about what it may hold, not
 * shared machinery learning Field Type names (ADR-0007). A Consumer's own
 * plugin is therefore not offered as a column until fieldkit is asked for that
 * — the conservative direction, and the cheap one to widen.
 */
export const VIRTUAL_TABLE_ROW_FIELD_TYPES: readonly string[] = [
	"text",
	"textarea",
	"markdown",
	"number",
	"date",
	"time",
	"boolean",
	"select",
	"radio",
	"checkboxes",
	"email",
	"url",
	"slug",
	"color",
	"lookup",
	"media",
	"single_reference",
];

const ROW_FIELD_TYPES = new Set(VIRTUAL_TABLE_ROW_FIELD_TYPES);

/** Whether a Field Type may be a Virtual Table column. */
export function isVirtualTableRowFieldType(fieldType: string): boolean {
	return ROW_FIELD_TYPES.has(fieldType);
}

/** The Blueprint a Virtual Table links its Row Spec to, or undefined for one
 * that links none. The single place the settings cast lives, so the validator,
 * the resolver and the renderer cannot read a Field differently. A blank
 * string is no link — that is what an Author clearing the picker leaves. */
export function virtualTableBlueprintId(field: Field): string | undefined {
	const blueprint = (field.settings as VirtualTableSettings | null | undefined)
		?.blueprint;
	if (typeof blueprint !== "string") return undefined;
	const trimmed = blueprint.trim();
	return trimmed === "" ? undefined : trimmed;
}

/**
 * Which of the two ways this Virtual Table declares its Row Spec — or that it
 * declares both or neither.
 *
 * Reads an **authored** Spec. `resolveSpec()` attaches a linked Row Spec's
 * Fields as `children` (ADR-0004), so a *Resolved* linked Virtual Table
 * carries a blueprint and children at once and reads as `both` here. That is
 * deliberate and costs nothing: validation runs on the Spec an Author saves,
 * and a Resolved Spec is never re-validated — it is the shape the renderer,
 * the table cell and the Schema builder consume.
 *
 * An empty `children` array is not an embedded Row Spec: a table with no
 * columns declares nothing, and resolving an empty Blueprint leaves exactly
 * that array on a linked Field.
 */
export function virtualTableRowSpecKind(field: Field): VirtualTableRowSpecKind {
	const linked = virtualTableBlueprintId(field) != null;
	const embedded = (field.children?.length ?? 0) > 0;
	if (linked && embedded) return "both";
	if (linked) return "linked";
	if (embedded) return "embedded";
	return "neither";
}
