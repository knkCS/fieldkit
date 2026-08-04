import { CountCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";
import { readReferenceTree } from "../../schema/reference-tree";

/**
 * How both Reference cells word a count, so the tree Field and the Single
 * Reference cannot read differently in the same table. Zero is `null` rather
 * than "0 references": an empty cell is the table's own convention for
 * nothing, and every other cell obeys it.
 */
export function referenceCountProps(count: number) {
	return {
		value: count === 0 ? null : count,
		singular: "reference",
		plural: "references",
	} as const;
}

/**
 * The Reference Tree at table density: how many References there are.
 *
 * Every one of them, at every level — a nested child is as real as a root, and
 * is what `max_items` counts too. Not the names: a cell has neither Adapter
 * access nor async, and a Reference stores only an id, so the alternative is a
 * row of raw ids. A count is the one thing that reads correctly in a table,
 * the way a Group cell already counts items (ADR-0008).
 *
 * SpecForm's read mode bypasses this cell entirely and renders the resolved
 * tree — see `ReferenceReadValue`.
 */
export function ReferenceCell({ value }: CellProps) {
	// A value that is not a list of References is a tree of none — form data is
	// only as well-formed as whatever produced it, and a cell must render the
	// empty dash rather than throw or print "[object Object]".
	const count = Array.isArray(value) ? readReferenceTree(value).length : 0;
	return <CountCell {...referenceCountProps(count)} />;
}
ReferenceCell.displayName = "ReferenceCell";
