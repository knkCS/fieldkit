import type { CellProps } from "../../schema/plugin";

export function NumberCell({ value }: CellProps) {
  if (value == null) return <span>—</span>;
  const num = Number(value);
  const formatted = Number.isNaN(num) ? String(value) : num.toLocaleString();
  return <span>{formatted}</span>;
}
NumberCell.displayName = "NumberCell";
