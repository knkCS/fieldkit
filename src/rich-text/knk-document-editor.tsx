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

/** A document's content, for telling two copies of one document apart from
 * two documents. */
function contentOf(value: unknown): string {
	return JSON.stringify(value ?? null);
}

/**
 * One knkeditor editor over a stored document.
 *
 * knkeditor loads `content` once, when it mounts. So a value the form sets
 * from outside — a reset, Discard, another row in the EditDrawer — remounts
 * the editor over it, while the editor's own edits, which come back as the
 * value, do not.
 *
 * Told apart by content, never by identity: React Hook Form hands the value
 * back as a deep clone of what `onChange` got, and clones it again whenever
 * any other field changes, so an identity check would remount the editor —
 * losing cursor, selection and history — on every keystroke.
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
	// The content the editor holds: what it loaded, then what it last wrote.
	const holds = useRef<string | null>(null);
	const [loaded, setLoaded] = useState({ value, generation: 0 });
	if (holds.current === null) holds.current = contentOf(value);
	if (value !== loaded.value) {
		const content = contentOf(value);
		const outside = content !== holds.current;
		holds.current = content;
		setLoaded({
			value,
			generation: outside ? loaded.generation + 1 : loaded.generation,
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
				holds.current = contentOf(document);
				onChange?.(document);
			}}
			onBlur={() => onBlur?.()}
		/>
	);
}
KnkDocumentEditor.displayName = "KnkDocumentEditor";
