// src/renderer/field-component.tsx
import { Alert } from "@knkcs/anker/primitives";
import { memo } from "react";
import type { Field } from "../schema/types";
import { FieldErrorBoundary } from "./field-error-boundary";
import { useFieldKit } from "./provider";

export interface FieldComponentProps {
	field: Field;
	readOnly?: boolean;
}

function FieldComponentInner({ field, readOnly }: FieldComponentProps) {
	const { getPlugin, onError } = useFieldKit();

	if (field.config.hidden) return null;

	const plugin = getPlugin(field.field_type);

	if (!plugin) {
		return (
			<Alert role="alert" status="error" title="Unknown field type">
				<code>{field.field_type}</code>
			</Alert>
		);
	}

	const Component = plugin.fieldComponent;

	return (
		<FieldErrorBoundary
			fieldId={field.config.api_accessor}
			fieldName={field.config.name}
			onError={onError}
		>
			<Component field={field} readOnly={readOnly || field.config.read_only} />
		</FieldErrorBoundary>
	);
}

export const FieldComponent = memo(FieldComponentInner, (prev, next) => {
	return (
		prev.field.config.api_accessor === next.field.config.api_accessor &&
		prev.field.field_type === next.field.field_type &&
		prev.readOnly === next.readOnly
	);
});
(FieldComponent as { displayName?: string }).displayName = "FieldComponent";
