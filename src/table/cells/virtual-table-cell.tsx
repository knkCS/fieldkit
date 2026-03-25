import { CountCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function VirtualTableCell({ value }: CellProps) {
	if (!Array.isArray(value)) return <CountCell value={null} singular="row" plural="rows" />;
	return <CountCell value={value} singular="row" plural="rows" />;
}
VirtualTableCell.displayName = "VirtualTableCell";
