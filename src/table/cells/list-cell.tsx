import { TruncatedTextCell } from "@knkcs/anker/components";
import type { ListSettings } from "../../schema/field-types/list";
import type { CellProps } from "../../schema/plugin";

/**
 * Table cell — and, through SpecForm's read mode, the read-only rendering —
 * for `list`. Shows the entries themselves rather than a count: the value is
 * a handful of short strings, and "3 entries" tells a reader nothing.
 */
export function ListCell({ value }: CellProps<ListSettings>) {
	if (!Array.isArray(value) || value.length === 0)
		return <TruncatedTextCell value={null} />;

	return <TruncatedTextCell value={value.map(String).join(", ")} />;
}
ListCell.displayName = "ListCell";
