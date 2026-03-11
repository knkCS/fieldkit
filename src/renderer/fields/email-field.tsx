import { InputField } from "@knkcs/anker/forms";
import type { EmailSettings } from "../../schema/field-types/email";
import type { FieldProps } from "../../schema/plugin";

export function EmailField({ field, readOnly }: FieldProps<EmailSettings>) {
	const { config, settings } = field;

	return (
		<InputField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			type="email"
			placeholder={settings?.placeholder}
		/>
	);
}
EmailField.displayName = "EmailField";
