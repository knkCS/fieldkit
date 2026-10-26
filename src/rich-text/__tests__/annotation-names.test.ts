// The Annotation names the schema layer restates (src/schema/annotations.ts)
// are knkeditor's own: its vocabulary exports them as review state
// (review-state.ts, knkeditor#766), and only this subpath, whose optional
// peer it is, may import it (ADR-0026). Go reads the same names from
// knkeditor's module (go/annotations.go).
import {
	COMMENT_MARK,
	COMMENT_THREADS_ATTRIBUTE,
	REVIEW_STATE_MARKS,
	REVIEW_STATE_NODE_ATTRIBUTES,
	SUGGESTION_ATTRIBUTE,
	SUGGESTION_DELETE_MARK,
	SUGGESTION_FORMAT_CHANGE_MARK,
	SUGGESTION_INSERT_MARK,
} from "@knkcms/knkeditor-vocabulary";
import { describe, expect, it } from "vitest";
import {
	ATTR_COMMENT_THREADS,
	ATTR_SUGGESTION,
	MARK_COMMENT,
	MARK_SUGGESTION_DELETE,
	MARK_SUGGESTION_FORMAT_CHANGE,
	MARK_SUGGESTION_INSERT,
} from "../../schema/annotations";

describe("Annotation names", () => {
	it("are knkeditor's review state", () => {
		expect(MARK_COMMENT).toBe(COMMENT_MARK);
		expect(MARK_SUGGESTION_INSERT).toBe(SUGGESTION_INSERT_MARK);
		expect(MARK_SUGGESTION_DELETE).toBe(SUGGESTION_DELETE_MARK);
		expect(MARK_SUGGESTION_FORMAT_CHANGE).toBe(SUGGESTION_FORMAT_CHANGE_MARK);
		expect(ATTR_COMMENT_THREADS).toBe(COMMENT_THREADS_ATTRIBUTE);
		expect(ATTR_SUGGESTION).toBe(SUGGESTION_ATTRIBUTE);
	});

	it("are all of knkeditor's review state", () => {
		// A review-state name knkeditor adds is an Annotation fieldkit does not
		// know yet: it would neither be settled nor found.
		expect([...REVIEW_STATE_MARKS].sort()).toEqual(
			[
				MARK_COMMENT,
				MARK_SUGGESTION_INSERT,
				MARK_SUGGESTION_DELETE,
				MARK_SUGGESTION_FORMAT_CHANGE,
			].sort(),
		);
		expect([...REVIEW_STATE_NODE_ATTRIBUTES].sort()).toEqual(
			[ATTR_COMMENT_THREADS, ATTR_SUGGESTION].sort(),
		);
	});
});
