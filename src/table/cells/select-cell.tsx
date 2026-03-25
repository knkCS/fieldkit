import { TruncatedTextCell } from "@knkcs/anker/components";
import type { SelectSettings } from "../../schema/field-types/select";
import type { CellProps } from "../../schema/plugin";

export function SelectCell({ field, value }: CellProps<SelectSettings>) {
	const options = field.settings?.options ?? {};

	if (Array.isArray(value)) {
		const labels = value.map((v) => options[String(v)] ?? String(v));
		return <TruncatedTextCell value={labels.join(", ") || null} />;
	}

	if (value == null || value === "") return <TruncatedTextCell value={null} />;
	const label = options[String(value)] ?? String(value);
	return <TruncatedTextCell value={label} />;
}
SelectCell.displayName = "SelectCell";
