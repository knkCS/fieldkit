import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CheckboxesSettings } from "../../schema/field-types/checkboxes";
import type { CellProps } from "../../schema/plugin";

export function CheckboxesCell({ field, value }: CellProps<CheckboxesSettings>) {
	const options = field.settings?.options ?? {};

	if (!Array.isArray(value) || value.length === 0) return <TruncatedTextCell value={null} />;

	const labels = value.map((v) => options[String(v)] ?? String(v));
	return <TruncatedTextCell value={labels.join(", ")} />;
}
CheckboxesCell.displayName = "CheckboxesCell";
