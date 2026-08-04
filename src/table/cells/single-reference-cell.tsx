import { CountCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";
import { asReference } from "../../schema/reference";
import { referenceCountProps } from "./reference-cell";

/**
 * The referenced Content, at table density: `1 reference`, or an empty cell.
 *
 * A cell has neither Adapter access nor async, so it cannot resolve a name —
 * and an id is not a name, it is the raw storage. ADR-0008's answer for a
 * Reference at table density is a count, and it applies here too: this cell
 * and the tree Field's are the same words over the same convention, so a
 * column of one and a column of the other read alike. Whether a Reference is
 * set is the honest thing a cell can say about it.
 *
 * SpecForm's read mode bypasses this cell for exactly that reason and resolves
 * the name — see `SingleReferenceReadValue`.
 */
export function SingleReferenceCell({ value }: CellProps) {
	return <CountCell {...referenceCountProps(asReference(value) ? 1 : 0)} />;
}
SingleReferenceCell.displayName = "SingleReferenceCell";
