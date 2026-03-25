import { TruncatedTextCell } from "@knkcs/anker/components";
import type { RadioSettings } from "../../schema/field-types/radio";
import type { CellProps } from "../../schema/plugin";

export function RadioCell({ field, value }: CellProps<RadioSettings>) {
	const options = field.settings?.options ?? {};
	if (value == null || value === "") return <TruncatedTextCell value={null} />;
	const label = options[String(value)] ?? String(value);
	return <TruncatedTextCell value={label} />;
}
RadioCell.displayName = "RadioCell";
