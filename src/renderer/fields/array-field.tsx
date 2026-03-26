import { ArrayField as AnkerArrayField } from "@knkcs/anker/forms";
import type { ArraySettings } from "../../schema/field-types/array";
import type { FieldProps } from "../../schema/plugin";

export function ArrayField({ field, readOnly }: FieldProps<ArraySettings>) {
	const { config, settings } = field;
	const { mode = "dynamic", keys } = settings ?? {};

	return (
		<AnkerArrayField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			mode={mode}
			keys={keys?.map((k) => ({ key: k, value: "" }))}
		/>
	);
}
ArrayField.displayName = "ArrayField";
