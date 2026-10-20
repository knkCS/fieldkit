import { RadioGroupField } from "@knkcs/anker/forms";
import { choiceOptions } from "../../schema/choice-options";
import type { RadioSettings } from "../../schema/field-types/radio";
import type { FieldProps } from "../../schema/plugin";

export function RadioField({ field, readOnly }: FieldProps<RadioSettings>) {
	const { config, settings } = field;
	// In the Options' order: list order is display order (ADR-0028).
	const options = choiceOptions(settings);

	return (
		<RadioGroupField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			options={options.map(({ key, label }) => ({ value: key, label }))}
		/>
	);
}
RadioField.displayName = "RadioField";
