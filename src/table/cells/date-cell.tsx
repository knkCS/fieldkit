import type { CellProps } from "../../schema/plugin";

export function DateCell({ value }: CellProps) {
  const text = value != null ? String(value) : "";
  return <span>{text}</span>;
}
DateCell.displayName = "DateCell";
