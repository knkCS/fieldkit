// src/rich-text/knk-document-editor.tsx
import KnkEditor, {
	defaultExtensions,
	type EditorProps,
	KnkeditorScope,
} from "@knkcms/knkeditor-editor";
import TextBlock from "@knkcms/knkeditor-extension-text-block";
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
	/** The editor's view key in an `EditorHost` (knkeditor ADR 0011): what
	 * the label row's Field view is bound to. Ignored outside a host. */
	viewKey?: string;
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
 * The page: A4 with a 10mm margin, as knkcms core lays out a Text Type
 * without a `page_width`. knkeditor's Text Type has no page width — it
 * refuses any key but `nodes`, `marks` and `minimumVocabularyVersion` — so
 * there is none to read yet.
 */
const PAGE = { width: 210, margin: 10 } as const;

/**
 * knkeditor's default extensions and the text block. Editor 3 dropped
 * `TextBlock` from its defaults (knkeditor#907): it is legacy content, and
 * Content imported from core may hold `textBlock` nodes, which an editor
 * without it would drop on load — and the next save with them. Built once:
 * knkeditor memoises the editor's extensions on this array's identity.
 */
const EXTENSIONS: EditorProps["extensions"] = [...defaultExtensions, TextBlock];

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
 *
 * It renders in knkeditor's own scoped Chakra system, knkeditor's exported
 * `KnkeditorScope` (ADR-0026, amended; contenthub#629), whose element its
 * menus, dialogs and popovers portal into. It grows with its document: knkeditor caps a fixed-toolbar editor at
 * `calc(100vh - 200px)` unless told otherwise, and a capped editor scrolls
 * inside a page that scrolls too, so the cap is `none`.
 *
 * Inside an `EditorHost` it has no Inspector or view menu of its own — the
 * page places them, and knkeditor switches the field's off itself
 * (contenthub#628). So nothing here passes `inspector` or `viewPicker`:
 * outside a host the field keeps its docked Inspector.
 */
export function KnkDocumentEditor({
	value,
	textType,
	editorSettings,
	viewMode,
	viewKey,
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
		<KnkeditorScope>
			<KnkEditor
				key={loaded.generation}
				content={documentOf(loaded.value)}
				extensions={EXTENSIONS}
				textType={textType}
				editorSettings={editorSettings}
				layout={viewMode === "compact" ? "minimal" : "page"}
				viewKey={viewKey}
				editingMode={readOnly ? "readOnly" : "content"}
				sections={{ devMenu: false }}
				pageOptions={PAGE}
				toolbarPosition="fixed"
				maxEditorHeight="none"
				onUpdate={({ editor }) => {
					const document = editor.getJSON();
					holds.current = contentOf(document);
					onChange?.(document);
				}}
				onBlur={() => onBlur?.()}
			/>
		</KnkeditorScope>
	);
}
KnkDocumentEditor.displayName = "KnkDocumentEditor";
