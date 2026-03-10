import type { CellProps } from "../../schema/plugin";

export function TimeCell({ value }: CellProps) {
  const text = value != null ? String(value) : "";
  return <span>{text}</span>;
}
TimeCell.displayName = "TimeCell";
