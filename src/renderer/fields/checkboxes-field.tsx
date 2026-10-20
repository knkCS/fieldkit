import { Stack } from "@chakra-ui/react";
import { CheckboxField, FormField } from "@knkcs/anker/forms";
import { choiceOptions } from "../../schema/choice-options";
import type { CheckboxesSettings } from "../../schema/field-types/checkboxes";
import type { FieldProps } from "../../schema/plugin";

export function CheckboxesField({
	field,
	readOnly,
}: FieldProps<CheckboxesSettings>) {
	const { config, settings } = field;
	// In the Options' order: list order is display order (ADR-0028).
	const options = choiceOptions(settings);

	return (
		<FormField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
		>
			{() => (
				<Stack>
					{options.map(({ key, label }, index) => (
						<CheckboxField
							// biome-ignore lint/suspicious/noArrayIndexKey: a draft may repeat a Key until it is saved (ADR-0028), so the Key alone is no identity
							key={`${index}:${key}`}
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
