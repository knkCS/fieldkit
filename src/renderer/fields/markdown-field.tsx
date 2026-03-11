import { MarkdownField as AnkerMarkdownField } from "@knkcs/anker/forms";
import type { MarkdownSettings } from "../../schema/field-types/markdown";
import type { FieldProps } from "../../schema/plugin";

export function MarkdownField({
	field,
	readOnly,
}: FieldProps<MarkdownSettings>) {
	const { config } = field;

	return (
		<AnkerMarkdownField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		/>
	);
}
MarkdownField.displayName = "MarkdownField";
