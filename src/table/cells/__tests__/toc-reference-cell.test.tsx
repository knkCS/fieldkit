import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { TocReferenceCell } from "../toc-reference-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "toc_reference",
	config: {
		name: "Test",
		api_accessor: "test",
		required: false,
		instructions: "",
		...overrides?.config,
	},
	settings: null,
	system: false,
});

describe("TocReferenceCell", () => {
	it("renders display_name from object", () => {
		render(
			<TocReferenceCell
				field={makeField()}
				value={{ id: "1", display_name: "Chapter 1" }}
			/>,
		);
		expect(screen.getByText("Chapter 1")).toBeDefined();
	});

	it("renders string value", () => {
		render(<TocReferenceCell field={makeField()} value="ref-id" />);
		expect(screen.getByText("ref-id")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<TocReferenceCell field={makeField()} value={null} />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<TocReferenceCell field={makeField()} value="" />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});
});
