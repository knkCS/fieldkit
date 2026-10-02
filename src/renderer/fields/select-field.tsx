import { BaseSelectField } from "@knkcs/anker/forms";
import { useMemo } from "react";
import type { SelectSettings } from "../../schema/field-types/select";
import type { FieldProps } from "../../schema/plugin";

/**
 * The `select` type as anker's form-bound `BaseSelect` (#314): every select
 * is a BaseSelect (knkCS/blueprinthub#153), single or multiple alike. The form
 * value is the option's key — a string, or an array of keys when `multiple` —
 * exactly what `selectPlugin.toZodType` reads. A cleared single select holds
 * `null`, which the plugin reads as Unset, as it does `""` (ADR-0021).
 */
export function SelectField({ field, readOnly }: FieldProps<SelectSettings>) {
	const { config, settings } = field;
	const options = settings?.options;
	const multiple = settings?.multiple ?? false;

	const choices = useMemo(
		() => Object.entries(options ?? {}).map(([id, label]) => ({ id, label })),
		[options],
	);

	return (
		<BaseSelectField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			options={choices}
			isMulti={multiple}
			placeholder="Select..."
			readOnly={readOnly}
			// CLAUDE.md asks for `readOnly`, not `disabled`, but BaseSelect only
			// knows `disabled`: it is the one way a read-mode select cannot be
			// changed, as the native select it replaces was disabled too.
			disabled={readOnly}
		/>
	);
}
SelectField.displayName = "SelectField";
