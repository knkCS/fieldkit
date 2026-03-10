import type { CellProps } from "../../schema/plugin";
import type { RadioSettings } from "../../schema/field-types/radio";

export function RadioCell({ field, value }: CellProps<RadioSettings>) {
  const options = field.settings?.options ?? {};
  if (value == null || value === "") return <span>—</span>;
  const label = options[String(value)] ?? String(value);
  return <span>{label}</span>;
}
RadioCell.displayName = "RadioCell";
