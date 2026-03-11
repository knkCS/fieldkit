import { CodeField as AnkerCodeField } from "@knkcs/anker/forms";
import type { CodeSettings } from "../../schema/field-types/code";
import type { FieldProps } from "../../schema/plugin";

export function CodeField({ field, readOnly }: FieldProps<CodeSettings>) {
	const { config, settings } = field;

	return (
		<AnkerCodeField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			language={settings?.language}
		/>
	);
}
CodeField.displayName = "CodeField";
