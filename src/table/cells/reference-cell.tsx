import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";
import { asReference } from "../../schema/reference";

/**
 * The Reference list at table density: how many there are.
 *
 * Not the names — a cell has neither Adapter access nor async, and a Reference
 * stores only an id, so the alternative is a row of raw ids. A count is the
 * one thing that reads correctly in a table.
 */
export function ReferenceCell({ value }: CellProps) {
	if (!Array.isArray(value)) return <TruncatedTextCell value={null} />;

	const count = value.filter((entry) => asReference(entry) !== null).length;
	if (count === 0) return <TruncatedTextCell value={null} />;

	return (
		<TruncatedTextCell
			value={count === 1 ? "1 reference" : `${String(count)} references`}
		/>
	);
}
ReferenceCell.displayName = "ReferenceCell";
