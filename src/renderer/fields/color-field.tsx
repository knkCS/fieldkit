import { ColorPickerField } from "@knkcs/anker/forms";
import type { ColorSettings } from "../../schema/field-types/color";
import type { FieldProps } from "../../schema/plugin";

export function ColorField({ field, readOnly }: FieldProps<ColorSettings>) {
	const { config } = field;

	return (
		<ColorPickerField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		/>
	);
}
ColorField.displayName = "ColorField";
