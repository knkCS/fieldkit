import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";
import { asReference } from "../../schema/reference";

/**
 * The referenced Content, at table density.
 *
 * A cell has neither Adapter access nor async, so it cannot resolve a name —
 * it shows the id, which is the one thing the value carries. SpecForm's read
 * mode bypasses this cell for exactly that reason and resolves the name.
 */
export function SingleReferenceCell({ value }: CellProps) {
	const reference = asReference(value);
	return <TruncatedTextCell value={reference ? reference.id : null} />;
}
SingleReferenceCell.displayName = "SingleReferenceCell";
