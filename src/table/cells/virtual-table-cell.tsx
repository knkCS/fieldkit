import type { CellProps } from "../../schema/plugin";

export function VirtualTableCell({ value }: CellProps) {
  if (value == null) return <span>—</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>0 rows</span>;
    return <span>{value.length} row{value.length !== 1 ? "s" : ""}</span>;
  }

  return <span>—</span>;
}
VirtualTableCell.displayName = "VirtualTableCell";
