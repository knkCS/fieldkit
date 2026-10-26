// src/schema/annotations.ts
//
// Annotations (contenthub ADR 0014, amended 2026-10-26): the comment anchors
// and suggestions knkeditor's comment and suggestion extensions store in a
// rich_text document. The rich-text field type tells two things about its
// values — whether a change is Annotation-only, and whether a value holds an
// open suggestion — and takes a value's comment anchors out at Publish, so
// contenthub never reads rich text itself. Go's
// go/annotations.go is the same rule; the fixtures in
// conformance/*/annotations hold both to one answer (contenthub ADR 0010).
//
// A pure walk over the stored JSON: the schema layer has no knkeditor reader
// (ADR-0026). The names are knkeditor's, which calls these marks and node
// attributes review state and exports them (@knkcms/knkeditor-vocabulary's
// review-state.ts, knkeditor#766) — but knkeditor is an optional peer of the
// /rich-text subpath only, so the schema layer cannot import it and restates
// them here, pinned to knkeditor's exports by a test
// (src/rich-text/__tests__/annotation-names.test.ts). Go reads knkeditor's
// own constants (go/annotations.go).

import { isPlainObject } from "./unset";

/** knkeditor's comment-anchor mark (`COMMENT_MARK`). */
export const MARK_COMMENT = "commentMark";
/** Text proposed for insertion: not yet the text (`SUGGESTION_INSERT_MARK`). */
export const MARK_SUGGESTION_INSERT = "suggestionInsert";
/** Text proposed for deletion: still the text (`SUGGESTION_DELETE_MARK`). */
export const MARK_SUGGESTION_DELETE = "suggestionDelete";
/** Text whose marks a suggestion changed — already applied, the change
 * recorded in `addedMarks` and `removedMarks`
 * (`SUGGESTION_FORMAT_CHANGE_MARK`). */
export const MARK_SUGGESTION_FORMAT_CHANGE = "suggestionFormatChange";
/** The node attribute anchoring comments on a whole node
 * (`COMMENT_THREADS_ATTRIBUTE`). */
export const ATTR_COMMENT_THREADS = "commentThreadIds";
/** The node attribute recording a suggestion on a whole node — inserted,
 * deleted, modified or moved (`SUGGESTION_ATTRIBUTE`). */
export const ATTR_SUGGESTION = "suggestion";

type JsonObject = Record<string, unknown>;

const isObject = isPlainObject;

function isSuggestionMark(name: unknown): boolean {
	return (
		name === MARK_SUGGESTION_INSERT ||
		name === MARK_SUGGESTION_DELETE ||
		name === MARK_SUGGESTION_FORMAT_CHANGE
	);
}

/**
 * Whether the rich_text value `next` differs from `base` only in Annotations
 * — comment anchors and suggestion marks added, removed or moved. Any change
 * to the text, its nodes, their attributes or any other mark is not
 * Annotation-only; nor is a suggestion accepted, which changes the text, nor
 * a suggestion on a whole node, which proposes the node itself. A suggestion
 * rejected leaves the text as it was, and is.
 *
 * Both are read as they would stand with every Annotation taken out and every
 * suggestion rejected, and compared as JSON values — marks as a set, adjacent
 * text with the same marks as one. Go's `RichTextAnnotationOnly`.
 */
export function richTextAnnotationOnly(base: unknown, next: unknown): boolean {
	return sameSettled(settled(base), settled(next));
}

/** Whether the rich_text value holds any suggestion — a suggestion mark, or a
 * suggestion on a node — at any depth. Go's `RichTextOpenSuggestion`. */
export function richTextOpenSuggestion(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(richTextOpenSuggestion);
	if (!isObject(value)) return false;
	const marks = value.marks;
	if (
		Array.isArray(marks) &&
		marks.some((mark) => isObject(mark) && isSuggestionMark(mark.type))
	) {
		return true;
	}
	const attrs = value.attrs;
	if (isObject(attrs) && attrs[ATTR_SUGGESTION] != null) return true;
	return Object.values(value).some(richTextOpenSuggestion);
}

/**
 * The rich_text value with every comment anchor taken out — each comment
 * mark, and each node's `commentThreadIds` — and everything else as it is,
 * suggestions included: contenthub refuses Publish while a value holds one,
 * so what it publishes is a value without its comment anchors
 * (contenthub#358). Text an anchor had split is joined again, as the editor
 * would, and marks or attrs left empty are absent. Only a node's content is
 * entered, as for {@link richTextAnnotationOnly}, which holds between the
 * value and the result. The value itself is not modified. Go's
 * `RichTextRemoveCommentAnchors`.
 */
export function richTextRemoveCommentAnchors(value: unknown): unknown {
	return withoutCommentAnchors(value).node;
}

/** A node without its comment anchors, its content's too; `removed` says
 * whether it held any itself. */
function withoutCommentAnchors(value: unknown): {
	node: unknown;
	removed: boolean;
} {
	if (!isObject(value)) return { node: value, removed: false };
	const out: JsonObject = { ...value };
	let removed = false;
	if (Array.isArray(value.marks)) {
		const kept = value.marks.filter(
			(mark) => !(isObject(mark) && mark.type === MARK_COMMENT),
		);
		if (kept.length < value.marks.length) {
			removed = true;
			if (kept.length === 0) delete out.marks;
			else out.marks = kept;
		}
	}
	const attrs = value.attrs;
	if (isObject(attrs) && ATTR_COMMENT_THREADS in attrs) {
		removed = true;
		const { [ATTR_COMMENT_THREADS]: _, ...kept } = attrs;
		if (Object.keys(kept).length === 0) delete out.attrs;
		else out.attrs = kept;
	}
	if (Array.isArray(value.content)) {
		out.content = contentWithoutCommentAnchors(value.content);
	}
	return { node: out, removed };
}

/** A node's children without their comment anchors, two adjacent text nodes
 * joined where a comment mark taken out of either leaves them with the same
 * marks: the anchor was what split them. */
function contentWithoutCommentAnchors(content: unknown[]): unknown[] {
	const out: unknown[] = [];
	let prevRemoved = false;
	for (const child of content) {
		const { node, removed } = withoutCommentAnchors(child);
		const prev = out[out.length - 1];
		if (
			(removed || prevRemoved) &&
			isObject(prev) &&
			isObject(node) &&
			joinable(prev, node)
		) {
			out[out.length - 1] = {
				...prev,
				text: (prev.text as string) + (node.text as string),
			};
			// The joined node ends with this one: only an anchor taken out of
			// it lets the next join it too.
			prevRemoved = removed;
			continue;
		}
		out.push(node);
		prevRemoved = removed;
	}
	return out;
}

/** A settled node dropped: a proposed insertion, not yet the text. */
const DROPPED = Symbol("dropped");

/**
 * A node as it stands with its Annotations taken out and its suggestions
 * rejected. Only a node's content is entered: a change anywhere else is no
 * Annotation's.
 *
 * - Comment marks, and a node's `commentThreadIds`, are dropped.
 * - Text (or an inline node) marked `suggestionInsert` is dropped.
 * - `suggestionDelete` is dropped, its text kept.
 * - `suggestionFormatChange` is dropped, and its change undone: the marks in
 *   `addedMarks` removed, those in `removedMarks` restored.
 * - A node's `suggestion` attribute is kept when set — never Annotation-only
 *   — and dropped when `null`, its default.
 * - `attrs` and `marks` that end up empty, or `null`, are absent.
 */
function settled(value: unknown): unknown {
	if (!isObject(value)) return value;
	const out: JsonObject = { ...value };
	if ("marks" in value) {
		const marks = settledMarks(value.marks);
		if (marks === DROPPED) return DROPPED;
		if (marks === undefined) delete out.marks;
		else out.marks = marks;
	}
	if ("attrs" in value) {
		const attrs = settledAttrs(value.attrs);
		if (attrs === undefined) delete out.attrs;
		else out.attrs = attrs;
	}
	if (Array.isArray(value.content)) out.content = settledContent(value.content);
	return out;
}

function settledMarks(raw: unknown): unknown {
	if (!Array.isArray(raw)) return raw === null ? undefined : raw;
	const kept: unknown[] = [];
	const added: string[] = [];
	const restored: JsonObject[] = [];
	for (const mark of raw) {
		if (!isObject(mark)) {
			kept.push(mark);
			continue;
		}
		switch (mark.type) {
			case MARK_SUGGESTION_INSERT:
				return DROPPED;
			case MARK_COMMENT:
			case MARK_SUGGESTION_DELETE:
				break;
			case MARK_SUGGESTION_FORMAT_CHANGE: {
				const attrs = isObject(mark.attrs) ? mark.attrs : {};
				for (const spec of markSpecs(attrs.addedMarks)) {
					if (typeof spec.name === "string") added.push(spec.name);
				}
				for (const spec of markSpecs(attrs.removedMarks)) {
					if (typeof spec.name !== "string") continue;
					restored.push(
						"attrs" in spec
							? { type: spec.name, attrs: spec.attrs }
							: { type: spec.name },
					);
				}
				break;
			}
			default:
				kept.push(settledMark(mark));
		}
	}
	const out = [
		...kept.filter(
			(mark) => !(isObject(mark) && added.includes(mark.type as string)),
		),
		...restored.map(settledMark),
	];
	return out.length === 0 ? undefined : out;
}

function markSpecs(raw: unknown): JsonObject[] {
	return Array.isArray(raw) ? raw.filter(isObject) : [];
}

/** A mark with `attrs` that are `null` or empty absent. */
function settledMark(mark: JsonObject): JsonObject {
	if (!("attrs" in mark)) return mark;
	const attrs = mark.attrs;
	if (attrs !== null && (!isObject(attrs) || Object.keys(attrs).length > 0)) {
		return mark;
	}
	const { attrs: _, ...rest } = mark;
	return rest;
}

/** A node's attrs without `commentThreadIds` and a `null` suggestion,
 * `undefined` when nothing is left. */
function settledAttrs(raw: unknown): unknown {
	if (raw === null) return undefined;
	if (!isObject(raw)) return raw;
	const out: JsonObject = {};
	for (const [key, value] of Object.entries(raw)) {
		if (key === ATTR_COMMENT_THREADS) continue;
		if (key === ATTR_SUGGESTION && value === null) continue;
		out[key] = value;
	}
	return Object.keys(out).length === 0 ? undefined : out;
}

/** A node's children settled, the dropped ones left out and adjacent text
 * nodes with the same marks joined: where an Annotation started or ended,
 * the editor split the text. */
function settledContent(content: unknown[]): unknown[] {
	const out: unknown[] = [];
	for (const child of content) {
		const node = settled(child);
		if (node === DROPPED) continue;
		const prev = out[out.length - 1];
		if (isObject(prev) && isObject(node) && joinable(prev, node)) {
			out[out.length - 1] = {
				...prev,
				text: (prev.text as string) + (node.text as string),
			};
			continue;
		}
		out.push(node);
	}
	return out;
}

/** Whether two settled nodes are text nodes holding nothing but their text
 * and the same marks. */
function joinable(a: JsonObject, b: JsonObject): boolean {
	for (const node of [a, b]) {
		if (node.type !== "text" || typeof node.text !== "string") return false;
		if (
			Object.keys(node).some(
				(key) => key !== "type" && key !== "text" && key !== "marks",
			)
		) {
			return false;
		}
	}
	return sameMarks(a.marks, b.marks);
}

/** Whether two JSON values are the same — objects whatever their key order. */
function sameValue(a: unknown, b: unknown): boolean {
	if (Array.isArray(a)) {
		return (
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((item, i) => sameValue(item, b[i]))
		);
	}
	if (isObject(a)) {
		if (!isObject(b)) return false;
		const keys = Object.keys(a);
		return (
			keys.length === Object.keys(b).length &&
			keys.every((key) => key in b && sameValue(a[key], b[key]))
		);
	}
	return a === b;
}

/** sameValue, with every node's marks compared as a set. */
function sameSettled(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((x, i) => sameSettled(x, b[i]));
	}
	if (!isObject(a) || !isObject(b)) return sameValue(a, b);
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => {
		if (!(key in b)) return false;
		if (key === "marks") return sameMarks(a[key], b[key]);
		if (key === "content") return sameSettled(a[key], b[key]);
		return sameValue(a[key], b[key]);
	});
}

/** Whether two mark lists hold the same marks in any order, each as often. */
function sameMarks(a: unknown, b: unknown): boolean {
	if (!Array.isArray(a) || !Array.isArray(b)) return sameValue(a, b);
	if (a.length !== b.length) return false;
	const used = new Array<boolean>(b.length).fill(false);
	return a.every((mark) => {
		const j = b.findIndex((other, i) => !used[i] && sameValue(mark, other));
		if (j < 0) return false;
		used[j] = true;
		return true;
	});
}
