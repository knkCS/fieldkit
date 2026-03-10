import type { CellProps } from "../../schema/plugin";

export function TextareaCell({ value }: CellProps) {
  const text = value != null ? String(value) : "";
  const truncated = text.length > 100 ? `${text.slice(0, 100)}...` : text;
  return <span title={text}>{truncated}</span>;
}
TextareaCell.displayName = "TextareaCell";
