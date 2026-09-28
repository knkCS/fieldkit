// src/schema/virtual-table-row-spec.ts
import { linkedBlueprintId } from "./blueprint-link";
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
 *
 * What a Row Spec may *hold* is not decided here: it is the `row` Position
 * (ADR-0022), which each type declares in its plugin's `positions` and
 * `validateSpec()` enforces for every container alike. The allow-list that
 * used to live in this module (`VIRTUAL_TABLE_ROW_FIELD_TYPES`) became those
 * declarations, with ADR-0017's allowed set unchanged.
 */
export type VirtualTableRowSpecKind =
	| "linked"
	| "embedded"
	| "both"
	| "neither";

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
 * An empty `children` array is not an embedded Row Spec: a Row Spec with no
 * Fields declares nothing, and resolving an empty Blueprint leaves exactly
 * that array on a linked Field.
 */
export function virtualTableRowSpecKind(field: Field): VirtualTableRowSpecKind {
	const linked = linkedBlueprintId(field) != null;
	const embedded = (field.children?.length ?? 0) > 0;
	if (linked && embedded) return "both";
	if (linked) return "linked";
	if (embedded) return "embedded";
	return "neither";
}
