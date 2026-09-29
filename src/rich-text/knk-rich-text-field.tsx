// src/rich-text/knk-rich-text-field.tsx
import { Skeleton, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { RichTextFallback } from "../renderer/fields/rich-text-field";
import { richTextPreview } from "../renderer/fields/rich-text-preview";
import type { RichTextSettings } from "../schema/field-types/rich-text";
import type { FieldProps, ReadProps } from "../schema/plugin";
import { KnkDocumentEditor } from "./knk-document-editor";
import { useRichTextSetup } from "./use-rich-text-setup";

const NOT_A_DOCUMENT =
	"Rich text can't be edited: the stored value isn't a rich-text document.";

/** An object (a document), or nothing stored at all. */
function isDocumentOrNone(value: unknown): boolean {
	if (value === undefined || value === null || value === "") return true;
	return typeof value === "object" && !Array.isArray(value);
}

/**
 * The knkeditor-backed `rich_text` field (ADR-0026): the document edited in
 * knkeditor's editor, under the Text Type the Field's `text_type` Pin names
 * and the workspace's Editor Settings.
 *
 * A Consumer opts in with `{ ...richTextPlugin, fieldComponent:
 * KnkRichTextField, readComponent: KnkRichTextRead }`, or takes
 * `knkRichTextPlugin`, which is exactly that. The Text Type comes from the
 * provider's `parts` (the Resolved Spec's), else the `textType` adapter; the
 * Editor Settings from the `editorSettings` adapter.
 *
 * A Text Type that needs a newer vocabulary than the editor bundles
 * (`needsNewerVocabulary`) opens read-only, saying why: the page predates a
 * deploy and must be reloaded. A Text Type that cannot be loaded at all opens
 * no editor either, and the failure goes to `onError`. Both show the document
 * read-only as the core renderer does, and never change the value.
 */
export function KnkRichTextField({
	field,
	readOnly,
}: FieldProps<RichTextSettings>) {
	const { control } = useFormContext();
	const setup = useRichTextSetup(field);
	const { config } = field;
	const value = useWatch({ name: config.api_accessor });

	if (setup.status === "unavailable") {
		return <RichTextFallback field={field} notice={setup.reason} />;
	}
	// A stored value that is no document — a string the old JSON textarea
	// wrote — would open an empty editor whose first edit replaces it.
	if (!isDocumentOrNone(value)) {
		return <RichTextFallback field={field} notice={NOT_A_DOCUMENT} />;
	}

	return (
		<FormField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{() =>
				setup.status === "loading" ? (
					<Skeleton
						height="32"
						data-testid={`rich-text-loading-${config.api_accessor}`}
					/>
				) : (
					<Controller
						name={config.api_accessor}
						control={control}
						render={({ field: formField }) => (
							<KnkDocumentEditor
								value={formField.value}
								textType={setup.textType}
								editorSettings={setup.editorSettings}
								viewMode={field.settings?.view_mode}
								readOnly={readOnly}
								onChange={formField.onChange}
								onBlur={formField.onBlur}
							/>
						)}
					/>
				)
			}
		</FormField>
	);
}
KnkRichTextField.displayName = "KnkRichTextField";

/**
 * The knkeditor-backed `rich_text` read view: the document in knkeditor's
 * editor, read-only, under the Field's Text Type — SpecForm's read mode.
 * Read mode renders an em dash for an empty value before it gets here.
 */
export function KnkRichTextRead({ field, value }: ReadProps<RichTextSettings>) {
	const setup = useRichTextSetup(field);
	if (setup.status === "loading") {
		return <Skeleton height="16" />;
	}
	if (setup.status === "unavailable" || !isDocumentOrNone(value)) {
		// No editor without its Text Type, not even a read-only one: its
		// schema might not hold the document; nor for a value that is no
		// document. Its text still reads.
		return <Text whiteSpace="pre-wrap">{richTextPreview(value)}</Text>;
	}
	return (
		<KnkDocumentEditor
			value={value}
			textType={setup.textType}
			editorSettings={setup.editorSettings}
			viewMode={field.settings?.view_mode}
			readOnly
		/>
	);
}
KnkRichTextRead.displayName = "KnkRichTextRead";
