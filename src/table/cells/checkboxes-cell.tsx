import type { CellProps } from "../../schema/plugin";
import type { CheckboxesSettings } from "../../schema/field-types/checkboxes";

export function CheckboxesCell({ field, value }: CellProps<CheckboxesSettings>) {
  const options = field.settings?.options ?? {};

  if (!Array.isArray(value) || value.length === 0) return <span>—</span>;

  const labels = value.map((v) => options[String(v)] ?? String(v));
  return <span>{labels.join(", ")}</span>;
}
CheckboxesCell.displayName = "CheckboxesCell";
