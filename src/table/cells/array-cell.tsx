import type { CellProps } from "../../schema/plugin";
import type { ArraySettings } from "../../schema/field-types/array";

export function ArrayCell({ field, value }: CellProps<ArraySettings>) {
  const mode = field.settings?.mode ?? "dynamic";

  if (mode === "keyed") {
    if (value == null || typeof value !== "object") return <span>—</span>;
    const count = Object.keys(value as Record<string, unknown>).length;
    return <span>{count} {count === 1 ? "entry" : "entries"}</span>;
  }

  if (!Array.isArray(value)) return <span>—</span>;
  const count = value.length;
  return <span>{count} {count === 1 ? "item" : "items"}</span>;
}
ArrayCell.displayName = "ArrayCell";
