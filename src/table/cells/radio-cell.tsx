import { TruncatedTextCell } from "@knkcs/anker/components";
import { choiceOptions, optionLabel } from "../../schema/choice-options";
import type { RadioSettings } from "../../schema/field-types/radio";
import type { CellProps } from "../../schema/plugin";

export function RadioCell({ field, value }: CellProps<RadioSettings>) {
	const options = choiceOptions(field.settings);
	if (value == null || value === "") return <TruncatedTextCell value={null} />;
	// A Key no Option has shows raw (ADR-0028).
	const label = optionLabel(options, String(value)) || String(value);
	return <TruncatedTextCell value={label} />;
}
RadioCell.displayName = "RadioCell";
