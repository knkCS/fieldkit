import { TruncatedTextCell } from "@knkcs/anker/components";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import type { CellProps } from "../../schema/plugin";

/**
 * Table cell — and, through SpecForm's read mode, the read-only rendering —
 * for `fieldset`. Shows the record's own values rather than a count, on the
 * same reasoning as ListCell: a column headed "Address" is worth reading
 * because it says "12 Bridge Lane, Ely", not because it says "2 fields".
 *
 * Only primitive values are summarised. A child that is itself a container
 * (a nested fieldset, a group, a list) has no one-line rendering here, so it
 * contributes nothing — a record holding only containers reads as empty.
 */
export function FieldsetCell({ value }: CellProps<FieldsetSettings>) {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return <TruncatedTextCell value={null} />;

	const summary = Object.values(value as Record<string, unknown>)
		.filter(
			(entry) =>
				(typeof entry === "string" && entry.trim() !== "") ||
				typeof entry === "number" ||
				typeof entry === "boolean",
		)
		.map(String)
		.join(", ");

	return <TruncatedTextCell value={summary === "" ? null : summary} />;
}
FieldsetCell.displayName = "FieldsetCell";
