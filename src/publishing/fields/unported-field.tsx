import { Textarea } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";

/**
 * The field component of a publishing type whose editing UI is not ported
 * yet (ADR-0002, amended): the stored value, read-only, as JSON — so a form
 * holding one shows what it holds and saves it untouched, and nothing on
 * screen pretends to edit it. A Consumer attaches its own component by
 * spreading the plugin: `{ ...manipulationTreePlugin, fieldComponent: Mine }`.
 */
export function UnportedField({ field }: FieldProps) {
	const { watch } = useFormContext();
	const { config } = field;
	const value = watch(config.api_accessor);
	return (
		<FormField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly
		>
			{(fieldProps) => (
				<Textarea
					{...fieldProps}
					readOnly
					fontFamily="mono"
					fontSize="sm"
					rows={6}
					value={value === undefined ? "" : JSON.stringify(value, null, 2)}
				/>
			)}
		</FormField>
	);
}
UnportedField.displayName = "UnportedField";
