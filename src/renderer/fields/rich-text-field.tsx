import { Box, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { useWatch } from "react-hook-form";
import type { RichTextSettings } from "../../schema/field-types/rich-text";
import type { FieldProps } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { richTextPreview } from "./rich-text-preview";

/** Why the core renderer shows rich text without editing it. */
const NOT_EDITABLE =
	"Rich text can't be edited here: the knkeditor-backed field isn't installed.";

export interface RichTextFallbackProps {
	field: Field<RichTextSettings>;
	/** Why the document is shown read-only, said under it. */
	notice: string;
}

/**
 * A rich_text Field's document shown read-only, as text: the core renderer's
 * `rich_text` field, and what the knkeditor-backed field of
 * `@knkcs/fieldkit/rich-text` falls back to when it cannot open an editor.
 *
 * Never an editable control. A document is knkeditor's inside (ADR-0025), so
 * anything but knkeditor editing it writes documents knkeditor's validation
 * refuses — the JSON textarea this replaced did exactly that. The value is
 * only watched, never registered or written, so the form keeps it as it was.
 *
 * Internal to fieldkit: exported from this module for the `/rich-text`
 * subpath, never from `/renderer`.
 */
export function RichTextFallback({ field, notice }: RichTextFallbackProps) {
	const { config } = field;
	const value = useWatch({ name: config.api_accessor });
	const text = richTextPreview(value);

	return (
		<FormField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly
		>
			{() => (
				<Box data-testid={`rich-text-fallback-${config.api_accessor}`}>
					<Box
						borderWidth="1px"
						borderColor="border.muted"
						borderRadius="l2"
						bg="bg.subtle"
						px="3"
						py="2"
						minH="10"
						whiteSpace="pre-wrap"
						color={text ? "fg" : "fg.subtle"}
					>
						{text || "—"}
					</Box>
					<Text fontSize="xs" color="fg.muted" mt="1">
						{notice}
					</Text>
				</Box>
			)}
		</FormField>
	);
}
RichTextFallback.displayName = "RichTextFallback";

/**
 * The core renderer's `rich_text` field: the document read-only, as text
 * (ADR-0026). Editing needs the knkeditor-backed field a Consumer opts into
 * from `@knkcs/fieldkit/rich-text` — `{ ...richTextPlugin, fieldComponent:
 * KnkRichTextField }` — so that only Consumers who import it pay for
 * knkeditor's peers.
 */
export function RichTextField({ field }: FieldProps<RichTextSettings>) {
	return <RichTextFallback field={field} notice={NOT_EDITABLE} />;
}
RichTextField.displayName = "RichTextField";
