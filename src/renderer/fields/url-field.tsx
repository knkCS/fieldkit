import { InputField } from "@knkcs/anker/forms";
import type { UrlSettings } from "../../schema/field-types/url";
import type { FieldProps } from "../../schema/plugin";

export function UrlField({ field, readOnly }: FieldProps<UrlSettings>) {
	const { config, settings } = field;

	return (
		<InputField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			type="url"
			placeholder={settings?.placeholder}
		/>
	);
}
UrlField.displayName = "UrlField";
