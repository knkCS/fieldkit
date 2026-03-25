import { Stack } from "@chakra-ui/react";
import { CheckboxField, FormField } from "@knkcs/anker/forms";
import type { CheckboxesSettings } from "../../schema/field-types/checkboxes";
import type { FieldProps } from "../../schema/plugin";

export function CheckboxesField({
	field,
	readOnly,
}: FieldProps<CheckboxesSettings>) {
	const { config } = field;
	const settings = field.settings ?? { options: {} };
	const options = settings.options ?? {};

	return (
		<FormField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
		>
			{() => (
				<Stack>
					{Object.entries(options).map(([key, label]) => (
						<CheckboxField
							key={key}
							name={config.api_accessor}
							value={key}
							label={label}
							disabled={readOnly}
						/>
					))}
				</Stack>
			)}
		</FormField>
	);
}
CheckboxesField.displayName = "CheckboxesField";
