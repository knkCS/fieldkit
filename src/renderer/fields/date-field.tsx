import { DatePickerField } from "@knkcs/anker/forms";
import type { DateSettings } from "../../schema/field-types/date";
import type { FieldProps } from "../../schema/plugin";

export function DateField({ field, readOnly }: FieldProps<DateSettings>) {
	const { config, settings } = field;

	return (
		<DatePickerField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			min={settings?.min_date}
			max={settings?.max_date}
			type="date"
		/>
	);
}
DateField.displayName = "DateField";
