import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

/**
 * The stored id, at table density — or an empty cell.
 *
 * A cell has neither adapter access nor async, so it cannot reach the Source
 * for a label. Showing the id is the honest thing it can say: it is what is
 * stored, and it is the same fallback the control itself shows for an id no
 * resolver could turn into a label.
 */
export function LookupCell({ value }: CellProps) {
	return (
		<TruncatedTextCell
			value={typeof value === "string" && value !== "" ? value : null}
		/>
	);
}
LookupCell.displayName = "LookupCell";
