import { DatePickerField } from "@knkcs/anker/forms";
import type { FieldProps } from "../../schema/plugin";

export function TimeField({ field, readOnly }: FieldProps) {
	const { config } = field;

	return (
		<DatePickerField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			type="time"
		/>
	);
}
TimeField.displayName = "TimeField";
