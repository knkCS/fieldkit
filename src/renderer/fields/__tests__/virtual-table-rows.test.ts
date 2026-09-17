import { describe, expect, it } from "vitest";
import {
	absoluteRowIndex,
	clampPage,
	DEFAULT_MAX_RECORDS_PER_PAGE,
	pageCount,
	pageOfRows,
	rowErrorMessages,
	rowsPerPage,
} from "../virtual-table-rows";

describe("rowsPerPage", () => {
	it("falls back to the plugin default when the Field names no size", () => {
		expect(rowsPerPage(undefined)).toBe(DEFAULT_MAX_RECORDS_PER_PAGE);
	});

	it("takes the Field's size", () => {
		expect(rowsPerPage(2)).toBe(2);
	});

	it("floors a page at one row, so paging cannot stall", () => {
		expect(rowsPerPage(0)).toBe(1);
		expect(rowsPerPage(-5)).toBe(1);
	});
});

describe("pageCount", () => {
	it("counts the pages rows fill", () => {
		expect(pageCount(5, 2)).toBe(3);
		expect(pageCount(4, 2)).toBe(2);
	});

	it("gives an empty table one page", () => {
		expect(pageCount(0, 25)).toBe(1);
	});
});

describe("clampPage", () => {
	it("keeps a page that exists", () => {
		expect(clampPage(2, 5, 2)).toBe(2);
	});

	it("falls back to the last page when rows were deleted from under it", () => {
		expect(clampPage(3, 2, 2)).toBe(1);
	});

	it("never goes below page one", () => {
		expect(clampPage(0, 5, 2)).toBe(1);
	});
});

describe("pageOfRows", () => {
	const rows = ["a", "b", "c", "d", "e"];

	it("slices the page asked for", () => {
		expect(pageOfRows(rows, 1, 2)).toEqual(["a", "b"]);
		expect(pageOfRows(rows, 3, 2)).toEqual(["e"]);
	});

	it("slices the last page when the page asked for is past the end", () => {
		expect(pageOfRows(rows, 9, 2)).toEqual(["e"]);
	});

	it("has nothing to slice for an empty table", () => {
		expect(pageOfRows([], 1, 2)).toEqual([]);
	});
});

describe("absoluteRowIndex", () => {
	it("maps a row's place on its page to its place in the array", () => {
		expect(absoluteRowIndex(0, 1, 2, 5)).toBe(0);
		expect(absoluteRowIndex(1, 3, 2, 5)).toBe(5);
		expect(absoluteRowIndex(0, 2, 2, 5)).toBe(2);
	});
});

describe("rowErrorMessages", () => {
	const errors = {
		line_items: {
			"1": {
				quantity: { type: "invalid_type", message: "Expected number" },
				description: { type: "too_small", message: "Required" },
			},
		},
	};

	it("keys a row's messages by the column they belong to", () => {
		expect(rowErrorMessages(errors, "line_items", 1)).toEqual({
			quantity: "Expected number",
			description: "Required",
		});
	});

	it("has nothing to say about a row that parsed", () => {
		expect(rowErrorMessages(errors, "line_items", 0)).toEqual({});
	});

	it("reads a Field nested under a dotted Accessor", () => {
		const nested = { order: { line_items: { "0": errors.line_items["1"] } } };
		expect(rowErrorMessages(nested, "order.line_items", 0)).toEqual({
			quantity: "Expected number",
			description: "Required",
		});
	});

	it("keys a message standing against the row itself under the empty string", () => {
		const rowLevel = {
			line_items: { "0": { type: "custom", message: "Row is incomplete" } },
		};
		expect(rowErrorMessages(rowLevel, "line_items", 0)).toEqual({
			"": "Row is incomplete",
		});
	});

	it("reports a Row Spec Field whose Accessor is `type`", () => {
		// react-hook-form stores `type` on an error object of its own; a Row
		// Spec is still entitled to a Field called Type.
		const typed = {
			line_items: {
				"0": { type: { type: "too_small", message: "Required" } },
			},
		};
		expect(rowErrorMessages(typed, "line_items", 0)).toEqual({
			type: "Required",
		});
	});

	it("says nothing when the Field has no errors at all", () => {
		expect(rowErrorMessages({}, "line_items", 0)).toEqual({});
		expect(rowErrorMessages(undefined, "line_items", 0)).toEqual({});
	});
});
