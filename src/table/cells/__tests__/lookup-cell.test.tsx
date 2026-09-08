import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { LookupCell } from "../lookup-cell";

const field: Field = {
	field_type: "lookup",
	config: {
		name: "Stylesheet",
		api_accessor: "stylesheet",
		required: false,
		instructions: "",
	},
	settings: { source: "layout:stylesheet" },
	system: false,
};

describe("LookupCell", () => {
	it("renders the stored id", () => {
		// The id, not a label: a cell has neither adapter access nor async, so
		// reaching the Source for a label is not available to it.
		render(<LookupCell field={field} value="sheet-1" />);
		expect(screen.getByText("sheet-1")).toBeDefined();
	});

	it("renders the empty cell value when nothing is stored", () => {
		render(<LookupCell field={field} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("treats a cleared control as empty rather than as an id", () => {
		render(<LookupCell field={field} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders the empty cell value for a malformed value", () => {
		// Never `[object Object]`: a Lookup stores a bare string, and anything
		// else in the column is corruption rather than something to display.
		render(<LookupCell field={field} value={{ id: "sheet-1" }} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
