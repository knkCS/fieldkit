import type { CellProps } from "../../schema/plugin";

export function BooleanCell({ value }: CellProps) {
	return <span>{value ? "Yes" : "No"}</span>;
}
BooleanCell.displayName = "BooleanCell";
