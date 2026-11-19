// src/rich-text/comments.tsx
import {
	Comment,
	type CommentExtensionOptions,
	getHiddenCommentThreads,
} from "@knkcms/knkeditor-extension-comment";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { SelectionBookmark } from "@tiptap/pm/state";
import { createContext, type ReactNode, useContext } from "react";

/**
 * The person asked to comment on the selection in a rich-text Field
 * (knkeditor's Comment button). The host composes the Comment — creates its
 * thread wherever it keeps threads — and then anchors it with `anchor`.
 */
export interface AddCommentRequest {
	/** The Field's form path (`body`, `rows.0.body`): which Field's text. */
	fieldPath: string;
	/** The selected text, for the composer to quote. */
	text: string;
	/**
	 * Anchors the thread `threadId` names on the selection the request was
	 * made on, followed through every edit since; the anchor reaches the
	 * form's value like any edit. Call it once the thread exists — awaiting
	 * the host's own save is fine. Answers false, anchoring nothing, when the
	 * request no longer stands: the selected text was deleted meanwhile, the
	 * editor is gone, a newer request replaced this one, or it was already
	 * answered. A request the host abandons needs no call.
	 */
	anchor: (threadId: string) => boolean;
}

/** The person clicked text (or a node) anchoring one or more Comments. */
export interface CommentClick {
	/** The Field's form path. */
	fieldPath: string;
	/** The threads anchored where they clicked, resolved ones left out. */
	threadIds: string[];
}

/**
 * What a host hands the knkeditor-backed rich_text field to say that the
 * value it edits is a working document — a contenthub Branch's — whose text
 * may hold Comments (knkeditor ADR 0006). Fieldkit keeps no thread, no
 * message and no resolved state: an anchor holds only an opaque thread id,
 * and everything about the thread is the host's.
 */
export interface RichTextComments {
	/** The person asked to comment on a selection. */
	onAddComment: (request: AddCommentRequest) => void;
	/** The person clicked a Comment's anchor. */
	onCommentClick?: (click: CommentClick) => void;
	/**
	 * The resolved threads. Their anchors stay in the document but are
	 * neither highlighted nor offered on click. A new list applies to the
	 * mounted editors at once, without an edit, a history entry or a
	 * remount; only its contents count, not its identity.
	 */
	resolvedThreadIds?: readonly string[];
}

const RichTextCommentsContext = createContext<RichTextComments | null>(null);

/**
 * Says that the rich-text values inside are a working document's (a
 * Branch's): every knkeditor-backed rich_text Field inside registers
 * knkeditor's comment extension, offers the Comment button and draws the
 * anchors its document holds. Outside one, no comment extension is
 * registered — a released value holds no anchors (knkeditor ADR 0006).
 *
 * Changing `comments` keeps the editors mounted; placing or removing the
 * provider remounts them, since the extensions an editor has are fixed when
 * it mounts.
 */
export function RichTextCommentsProvider({
	comments,
	children,
}: {
	comments: RichTextComments;
	children: ReactNode;
}) {
	return (
		<RichTextCommentsContext.Provider value={comments}>
			{children}
		</RichTextCommentsContext.Provider>
	);
}
RichTextCommentsProvider.displayName = "RichTextCommentsProvider";

/** The host's Comments, inside a `RichTextCommentsProvider`; else null. */
export function useRichTextComments(): RichTextComments | null {
	return useContext(RichTextCommentsContext);
}

/** The resolved threads as one string, for telling two lists apart by
 * contents. */
export function resolvedKey(comments: RichTextComments | null): string {
	return JSON.stringify([...(comments?.resolvedThreadIds ?? [])].sort());
}

interface PendingRequest {
	bookmark: SelectionBookmark;
}

/**
 * One editor's link to the host's Comments: the comment extension, with its
 * callbacks reading the host's latest ones through `latest`, so a host
 * passing new callbacks each render never remounts the editor.
 */
export interface CommentBridge {
	extension: ReturnType<typeof Comment.configure>;
	/** Applies the host's current resolved threads to the editor. */
	syncResolved: () => void;
}

function sameThreads(a: readonly string[], b: readonly string[]): boolean {
	const set = new Set(a);
	return set.size === new Set(b).size && b.every((id) => set.has(id));
}

/**
 * Builds the comment extension for one editor. It knows its editor through
 * its own lifecycle hooks — knkeditor's editor exposes none — and follows a
 * pending request's selection through every transaction, so an anchor made
 * after an await lands on the text that was selected.
 *
 * At most one request is pending per editor: a newer one replaces it.
 */
export function createCommentBridge(
	latest: () => { comments: RichTextComments | null; fieldPath: string },
): CommentBridge {
	let editor: TiptapEditor | null = null;
	let pending: PendingRequest | null = null;

	const resolved = () => [...(latest().comments?.resolvedThreadIds ?? [])];

	const syncResolved = () => {
		if (!editor || editor.isDestroyed) return;
		const ids = resolved();
		if (sameThreads(getHiddenCommentThreads(editor.state), ids)) return;
		editor.commands.setHiddenCommentThreads(ids);
	};

	const requestAddComment = () => {
		const { comments, fieldPath } = latest();
		if (!comments || !editor) return;
		const target = editor;
		const { selection, doc } = target.state;
		const request: PendingRequest = { bookmark: selection.getBookmark() };
		pending = request;
		comments.onAddComment({
			fieldPath,
			text: doc.textBetween(selection.from, selection.to, " "),
			anchor: (threadId) => {
				if (pending !== request || editor !== target || target.isDestroyed) {
					return false;
				}
				pending = null;
				const at = request.bookmark.resolve(target.state.doc);
				if (at.empty) return false;
				return target
					.chain()
					.command(({ tr }) => {
						tr.setSelection(at);
						return true;
					})
					.addCommentThread({ threadId })
					.run();
			},
		});
	};

	const options: Partial<CommentExtensionOptions> = {
		onRequestAddComment: requestAddComment,
		onCommentClick: (threadIds) => {
			const { comments, fieldPath } = latest();
			comments?.onCommentClick?.({ fieldPath, threadIds });
		},
		hiddenThreadIds: resolved(),
	};

	const extension = Comment.extend({
		onCreate(props) {
			this.parent?.(props);
			editor = this.editor;
			// The resolved threads may have changed between building this
			// extension and the editor that runs it.
			syncResolved();
		},
		onTransaction(props) {
			this.parent?.(props);
			if (pending) {
				pending.bookmark = pending.bookmark.map(props.transaction.mapping);
			}
		},
		onDestroy() {
			this.parent?.();
			editor = null;
			pending = null;
		},
	}).configure(options);

	return { extension, syncResolved };
}

/** A thread id as a CSS string: ids are opaque, and an anchor's never holds
 * whitespace (knkeditor refuses one), so quotes and backslashes are all
 * that need escaping. */
function cssString(id: string): string {
	return `"${id.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

const NO_HIGHLIGHT = { background: "none", boxShadow: "none" } as const;

/**
 * The anchors' highlight, scoped to the editor. knkeditor leaves comment
 * styling to the host (its `default.css` is opt-in, and its Review layer only
 * switches highlights off), and fieldkit is the editor's host here, so it
 * styles them, in the colours of knkeditor's `default.css`.
 *
 * A resolved thread's anchor has none. knkeditor marks it with
 * `data-comment-hidden`, which on a text anchor sits on a span inside the
 * anchor's, so dropping the anchor's own highlight takes `:has()` —
 * `default.css`'s way — and jsdom's selector engine throws on `:has()` beside
 * React's ids, which would break every jsdom test of a host. So a text
 * anchor's highlight is dropped by its thread id, from the same list the
 * editor hides; a node anchor carries the attribute itself. Overlapping
 * anchors nest, one span per thread, so text an open thread also anchors
 * stays highlighted.
 */
export function commentHighlight(resolvedThreadIds: readonly string[]) {
	const css: Record<string, Record<string, string>> = {
		"& .comment-thread": { backgroundColor: "rgba(254, 240, 138, 0.4)" },
		// A text anchor's state sits on a span inside it, a node anchor's on
		// the anchor itself.
		'& .comment-thread[data-state="hovered"], & .comment-thread [data-state="hovered"]':
			{
				backgroundColor: "rgba(254, 240, 138, 0.75)",
				boxShadow: "inset 0 -2px 0 rgba(202, 138, 4, 0.55)",
			},
		'& .comment-thread[data-state="selected"], & .comment-thread [data-state="selected"]':
			{
				backgroundColor: "rgba(254, 240, 138, 1)",
				boxShadow: "inset 0 -2px 0 rgba(202, 138, 4, 0.9)",
			},
		'& .comment-thread[data-comment-hidden="node"]': { ...NO_HIGHLIGHT },
	};
	if (resolvedThreadIds.length > 0) {
		const selector = [...resolvedThreadIds]
			.sort()
			.map((id) => `& .comment-thread[data-thread-id=${cssString(id)}]`)
			.join(", ");
		css[selector] = { ...NO_HIGHLIGHT };
	}
	return css;
}
