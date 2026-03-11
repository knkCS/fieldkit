import { InputField } from "@knkcs/anker/forms";
import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import type { SlugSettings } from "../../schema/field-types/slug";
import type { FieldProps } from "../../schema/plugin";

function toSlug(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function SlugField({ field, readOnly }: FieldProps<SlugSettings>) {
	const { config, settings } = field;
	const { watch, setValue } = useFormContext();

	const sourceField = settings?.source_field;

	useEffect(() => {
		if (!sourceField) return;

		const subscription = watch((formValues, { name }) => {
			if (name === sourceField) {
				const sourceValue = formValues[sourceField];
				if (typeof sourceValue === "string") {
					setValue(config.api_accessor, toSlug(sourceValue));
				}
			}
		});

		return () => subscription.unsubscribe();
	}, [sourceField, watch, setValue, config.api_accessor]);

	return (
		<InputField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
			placeholder="e.g. my-page-slug"
		/>
	);
}
SlugField.displayName = "SlugField";
