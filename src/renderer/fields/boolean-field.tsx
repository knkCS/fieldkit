import { SwitchField } from "@knkcs/anker/forms";
import type { FieldProps } from "../../schema/plugin";

export function BooleanField({ field, readOnly }: FieldProps) {
	const { config } = field;

	return (
		<SwitchField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		/>
	);
}
BooleanField.displayName = "BooleanField";
