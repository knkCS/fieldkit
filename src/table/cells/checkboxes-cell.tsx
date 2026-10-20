import { TruncatedTextCell } from "@knkcs/anker/components";
import {
	choiceOptions,
	inOptionOrder,
	optionLabel,
} from "../../schema/choice-options";
import type { CheckboxesSettings } from "../../schema/field-types/checkboxes";
import type { CellProps } from "../../schema/plugin";

export function CheckboxesCell({
	field,
	value,
}: CellProps<CheckboxesSettings>) {
	const options = choiceOptions(field.settings);

	if (!Array.isArray(value) || value.length === 0)
		return <TruncatedTextCell value={null} />;

	// In the Options' order (ADR-0028); a Key no Option has shows raw.
	const labels = inOptionOrder(options, value).map(
		(key) => optionLabel(options, key) || key,
	);
	return <TruncatedTextCell value={labels.join(", ")} />;
}
CheckboxesCell.displayName = "CheckboxesCell";
