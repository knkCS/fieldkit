import type { CellProps } from "../../schema/plugin";
import type { SelectSettings } from "../../schema/field-types/select";

export function SelectCell({ field, value }: CellProps<SelectSettings>) {
  const options = field.settings?.options ?? {};

  if (Array.isArray(value)) {
    const labels = value.map((v) => options[String(v)] ?? String(v));
    return <span>{labels.join(", ")}</span>;
  }

  if (value == null || value === "") return <span>—</span>;
  const label = options[String(value)] ?? String(value);
  return <span>{label}</span>;
}
SelectCell.displayName = "SelectCell";
