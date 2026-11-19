// src/rich-text/knk-document-editor.tsx
import KnkEditor, {
	defaultExtensions,
	type EditorProps,
	KnkeditorScope,
} from "@knkcms/knkeditor-editor";
import type {
	EditorSettings,
	ResolvedTextType,
} from "@knkcms/knkeditor-vocabulary";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RichTextSettings } from "../schema/field-types/rich-text";
import {
	commentHighlight,
	createCommentBridge,
	type RichTextComments,
	resolvedKey,
} from "./comments";

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
	/** The host's Comments when the value is a working document's (a
	 * Branch's; `RichTextCommentsProvider`): the comment extension is
	 * registered only then. */
	comments?: RichTextComments | null;
	/** The Field's form path, which the Comment callbacks name. */
	fieldPath?: string;
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
 * knkeditor's default extensions, unchanged. From knkeditor-editor 4 they
 * load the whole vocabulary (knkboor/general#2213) — the legacy text block
 * among them, which Content imported from core may hold — and register the
 * kind model's `semanticMark`, which takes its kinds from the Text Type
 * (knkboor/general#2212, #2214). Adding `TextBlock` again would register
 * it twice. Passed as the module's one array: knkeditor memoises the editor's
 * extensions on its identity.
 */
const EXTENSIONS: EditorProps["extensions"] = defaultExtensions;

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
	comments = null,
	fieldPath = "",
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

	// Comments (a Branch's value): one bridge per editor mounted, reading the
	// host's latest callbacks, so new ones each render remount nothing.
	const latest = useRef({ comments, fieldPath });
	latest.current = { comments, fieldPath };
	const withComments = comments !== null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: each editor mounted — a remount over an outside value too — needs a bridge of its own
	const bridge = useMemo(
		() => (withComments ? createCommentBridge(() => latest.current) : null),
		[withComments, loaded.generation],
	);
	const extensions = useMemo<EditorProps["extensions"]>(
		() => (bridge ? [...defaultExtensions, bridge.extension] : EXTENSIONS),
		[bridge],
	);
	// The resolved threads, by contents: a new list applies at once.
	const resolved = resolvedKey(comments);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `resolved` is what changed; the bridge reads the list itself
	useEffect(() => {
		bridge?.syncResolved();
	}, [bridge, resolved]);
	const highlight = useMemo(
		() =>
			bridge ? commentHighlight(JSON.parse(resolved) as string[]) : undefined,
		[bridge, resolved],
	);

	return (
		<KnkeditorScope css={highlight}>
			<KnkEditor
				key={`${loaded.generation}${bridge ? ":comments" : ""}`}
				content={documentOf(loaded.value)}
				extensions={extensions}
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
