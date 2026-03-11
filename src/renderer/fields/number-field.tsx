import { NumberInputField } from "@knkcs/anker/forms";
import type { NumberSettings } from "../../schema/field-types/number";
import type { FieldProps } from "../../schema/plugin";

export function NumberField({ field, readOnly }: FieldProps<NumberSettings>) {
	const { config, settings } = field;

	return (
		<NumberInputField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			min={settings?.min}
			max={settings?.max}
			step={settings?.step}
		/>
	);
}
NumberField.displayName = "NumberField";
