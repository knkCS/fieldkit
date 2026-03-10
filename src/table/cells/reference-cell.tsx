import type { CellProps } from "../../schema/plugin";

export function ReferenceCell({ value }: CellProps) {
  if (value == null) return <span>—</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>—</span>;
    const display = value.map((v) => {
      if (typeof v === "object" && v !== null && "display_name" in v) {
        return String((v as Record<string, unknown>).display_name);
      }
      return String(v);
    });
    const text = display.join(", ");
    const truncated = text.length > 100 ? `${text.slice(0, 100)}...` : text;
    return <span title={text}>{truncated}</span>;
  }

  const text = String(value);
  return <span>{text}</span>;
}
ReferenceCell.displayName = "ReferenceCell";
