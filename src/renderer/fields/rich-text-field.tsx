import { Textarea } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Controller, useFormContext } from "react-hook-form";
import type { RichTextSettings } from "../../schema/field-types/rich-text";
import type { FieldProps } from "../../schema/plugin";

export function RichTextField({
	field,
	readOnly,
}: FieldProps<RichTextSettings>) {
	const { control } = useFormContext();
	const { config } = field;

	return (
		<FormField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{(fieldProps) => (
				<Controller
					name={config.api_accessor}
					control={control}
					render={({ field: formField }) => {
						const textValue =
							typeof formField.value === "string"
								? formField.value
								: formField.value != null
									? JSON.stringify(formField.value, null, 2)
									: "";

						return (
							<Textarea
								{...fieldProps}
								value={textValue}
								onChange={(e) => {
									try {
										const parsed = JSON.parse(e.target.value);
										formField.onChange(parsed);
									} catch {
										formField.onChange(e.target.value);
									}
								}}
								onBlur={formField.onBlur}
								ref={formField.ref}
								readOnly={readOnly}
								placeholder="Rich text content..."
								rows={8}
							/>
						);
					}}
				/>
			)}
		</FormField>
	);
}
RichTextField.displayName = "RichTextField";
