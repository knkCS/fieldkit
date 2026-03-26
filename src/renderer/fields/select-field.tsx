import { SelectField as AnkerSelectField, FormField } from "@knkcs/anker/forms";
import { Controller, useFormContext } from "react-hook-form";
import type { SelectSettings } from "../../schema/field-types/select";
import type { FieldProps } from "../../schema/plugin";

export function SelectField({ field, readOnly }: FieldProps<SelectSettings>) {
	const { control } = useFormContext();
	const { config, settings } = field;
	const { options = {}, multiple } = settings ?? { options: {} };

	if (multiple) {
		return (
			<FormField
				name={config.api_accessor}
				label={config.name}
				helperText={config.instructions || undefined}
				required={config.required}
			>
				{() => (
					<Controller
						name={config.api_accessor}
						control={control}
						render={({ field: formField }) => (
							<select
								multiple
								disabled={readOnly}
								style={
									readOnly
										? { pointerEvents: "none" as const, opacity: 0.6 }
										: undefined
								}
								value={Array.isArray(formField.value) ? formField.value : []}
								onChange={(e) => {
									const selected = Array.from(
										e.target.selectedOptions,
										(opt) => opt.value,
									);
									formField.onChange(selected);
								}}
							>
								{Object.entries(options).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						)}
					/>
				)}
			</FormField>
		);
	}

	return (
		<AnkerSelectField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			placeholder="Select..."
		>
			{Object.entries(options).map(([key, label]) => (
				<option key={key} value={key}>
					{label}
				</option>
			))}
		</AnkerSelectField>
	);
}
SelectField.displayName = "SelectField";
