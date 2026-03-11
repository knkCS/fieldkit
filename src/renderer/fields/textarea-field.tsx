import { TextareaField as AnkerTextareaField } from "@knkcs/anker/forms";
import type { TextareaSettings } from "../../schema/field-types/textarea";
import type { FieldProps } from "../../schema/plugin";

export function TextareaField({
	field,
	readOnly,
}: FieldProps<TextareaSettings>) {
	const { config, settings } = field;

	return (
		<AnkerTextareaField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			placeholder={settings?.placeholder}
			textareaProps={settings?.rows ? { rows: settings.rows } : undefined}
		/>
	);
}
TextareaField.displayName = "TextareaField";
