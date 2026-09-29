// src/rich-text/knk-document-editor.tsx
import KnkEditor, { type EditorProps } from "@knkcms/knkeditor-editor";
import type {
	EditorSettings,
	ResolvedTextType,
} from "@knkcms/knkeditor-vocabulary";
import { useRef, useState } from "react";
import type { RichTextSettings } from "../schema/field-types/rich-text";

export interface KnkDocumentEditorProps {
	/** The stored document; anything but an object opens an empty one. */
	value: unknown;
	textType?: ResolvedTextType;
	editorSettings?: EditorSettings;
	viewMode?: RichTextSettings["view_mode"];
	readOnly?: boolean;
	onChange?: (document: Record<string, unknown>) => void;
	onBlur?: () => void;
}

function documentOf(value: unknown): EditorProps["content"] {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as EditorProps["content"])
		: "";
}

/**
 * One knkeditor editor over a stored document.
 *
 * knkeditor loads `content` once, when it mounts. So a value the form sets
 * from outside — a reset, Discard, another row in the EditDrawer — remounts
 * the editor over it, while the editor's own edits, which come back as the
 * value, do not.
 */
export function KnkDocumentEditor({
	value,
	textType,
	editorSettings,
	viewMode,
	readOnly,
	onChange,
	onBlur,
}: KnkDocumentEditorProps) {
	// The last document this editor wrote, so its own edits are told apart
	// from a value set from outside.
	const written = useRef<unknown>(undefined);
	const [loaded, setLoaded] = useState({ value, generation: 0 });
	if (value !== loaded.value) {
		setLoaded({
			value,
			generation:
				value === written.current ? loaded.generation : loaded.generation + 1,
		});
	}

	return (
		<KnkEditor
			key={loaded.generation}
			content={documentOf(loaded.value)}
			textType={textType}
			editorSettings={editorSettings}
			viewMode={viewMode === "compact" ? "minimal" : "default"}
			editingMode={readOnly ? "readOnly" : "content"}
			sections={{ devMenu: false }}
			maxEditorHeight="60vh"
			onUpdate={({ editor }) => {
				const document = editor.getJSON();
				written.current = document;
				onChange?.(document);
			}}
			onBlur={() => onBlur?.()}
		/>
	);
}
KnkDocumentEditor.displayName = "KnkDocumentEditor";
