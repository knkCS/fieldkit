import { InputField } from "@knkcs/anker/forms";
import type { TextSettings } from "../../schema/field-types/text";
import type { FieldProps } from "../../schema/plugin";

export function TextField({ field, readOnly }: FieldProps<TextSettings>) {
	const { config, settings } = field;

	return (
		<InputField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			placeholder={settings?.placeholder}
			prepend={settings?.prepend}
			append={settings?.append}
		/>
	);
}
TextField.displayName = "TextField";
