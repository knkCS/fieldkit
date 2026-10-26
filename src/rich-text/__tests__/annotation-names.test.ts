// The Annotation mark names the schema layer restates (src/schema/annotations.ts)
// are knkeditor's own. Its vocabulary leaves review state out, so they are
// read here from @knkcms/knkeditor-core, which only this subpath's tests may
// import (ADR-0026). Go restates the same names (go/annotations.go), pinned
// to these by the shared fixtures in conformance/*/annotations.
import {
	COMMENT_MARK,
	SUGGESTION_DELETE,
	SUGGESTION_FORMAT_CHANGE,
	SUGGESTION_INSERT,
} from "@knkcms/knkeditor-core";
import { describe, expect, it } from "vitest";
import {
	MARK_COMMENT,
	MARK_SUGGESTION_DELETE,
	MARK_SUGGESTION_FORMAT_CHANGE,
	MARK_SUGGESTION_INSERT,
} from "../../schema/annotations";

describe("Annotation mark names", () => {
	it("are knkeditor's", () => {
		expect(MARK_COMMENT).toBe(COMMENT_MARK);
		expect(MARK_SUGGESTION_INSERT).toBe(SUGGESTION_INSERT);
		expect(MARK_SUGGESTION_DELETE).toBe(SUGGESTION_DELETE);
		expect(MARK_SUGGESTION_FORMAT_CHANGE).toBe(SUGGESTION_FORMAT_CHANGE);
	});
});
