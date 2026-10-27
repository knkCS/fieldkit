// src/renderer/fields/no-source-field.tsx
import { Stack, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { useWatch } from "react-hook-form";
import type { Field } from "../../schema/types";
import { DEFAULT_READ_VALUE_LABELS, ReadValue } from "../read-value";

/**
 * A value control with nothing to fill it from: the Consumer registered no
 * Adapter (or no Source) the type's value needs (ADR-0027, amended: by
 * value). The type picker hides such a type, so a Field of it is one that was
 * already stored — and it stays shown and readable: the note says what the
 * application has no source for, no input is offered, and the stored value is
 * shown as read mode shows it. Nothing here writes to the form.
 */
export function NoSourceField({
	field,
	readOnly,
	message,
}: {
	field: Field;
	readOnly?: boolean;
	/** What the application lacks, said in place of the input. */
	message: string;
}) {
	const { config } = field;
	const accessor = config.api_accessor;
	const value = useWatch({ name: accessor }) as unknown;
	return (
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{() => (
				<Stack gap={1}>
					<Text
						color="fg.muted"
						fontSize="sm"
						data-testid={`${accessor}-no-source`}
					>
						{message}
					</Text>
					<ReadValue
						field={field}
						value={value}
						labels={DEFAULT_READ_VALUE_LABELS}
					/>
				</Stack>
			)}
		</FormField>
	);
}
NoSourceField.displayName = "NoSourceField";
