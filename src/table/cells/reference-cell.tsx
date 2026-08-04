import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";
import { readReferenceTree } from "../../schema/reference-tree";

/**
 * The Reference Tree at table density: how many References there are.
 *
 * Every one of them, at every level — a nested child is as real as a root, and
 * is what `max_items` counts too. Not the names: a cell has neither Adapter
 * access nor async, and a Reference stores only an id, so the alternative is a
 * row of raw ids. A count is the one thing that reads correctly in a table.
 */
export function ReferenceCell({ value }: CellProps) {
	if (!Array.isArray(value)) return <TruncatedTextCell value={null} />;

	const count = readReferenceTree(value).length;
	if (count === 0) return <TruncatedTextCell value={null} />;

	return (
		<TruncatedTextCell
			value={count === 1 ? "1 reference" : `${String(count)} references`}
		/>
	);
}
ReferenceCell.displayName = "ReferenceCell";
