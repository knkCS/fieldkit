import { TruncatedTextCell } from "@knkcs/anker/components";
import {
	choiceOptions,
	inOptionOrder,
	optionLabel,
} from "../../schema/choice-options";
import type { SelectSettings } from "../../schema/field-types/select";
import type { CellProps } from "../../schema/plugin";

export function SelectCell({ field, value }: CellProps<SelectSettings>) {
	const options = choiceOptions(field.settings);

	if (Array.isArray(value)) {
		// In the Options' order (ADR-0028); a Key no Option has shows raw.
		const labels = inOptionOrder(options, value).map(
			(key) => optionLabel(options, key) || key,
		);
		return <TruncatedTextCell value={labels.join(", ") || null} />;
	}

	if (value == null || value === "") return <TruncatedTextCell value={null} />;
	const label = optionLabel(options, String(value)) || String(value);
	return <TruncatedTextCell value={label} />;
}
SelectCell.displayName = "SelectCell";
