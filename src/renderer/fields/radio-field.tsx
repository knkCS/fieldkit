import { RadioGroupField } from "@knkcs/anker/forms";
import type { RadioSettings } from "../../schema/field-types/radio";
import type { FieldProps } from "../../schema/plugin";

export function RadioField({ field, readOnly }: FieldProps<RadioSettings>) {
	const { config, settings } = field;
	const { options = {} } = settings ?? {};

	return (
		<RadioGroupField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			options={Object.entries(options).map(([value, label]) => ({
				value,
				label,
			}))}
		/>
	);
}
RadioField.displayName = "RadioField";
