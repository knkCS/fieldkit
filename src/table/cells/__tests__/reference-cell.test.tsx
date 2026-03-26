import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { ReferenceCell } from "../reference-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "reference",
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

describe("ReferenceCell", () => {
	it("renders display names from array of objects", () => {
		const refs = [
			{ id: "1", display_name: "Article A" },
			{ id: "2", display_name: "Article B" },
		];
		render(<ReferenceCell field={makeField()} value={refs} />);
		expect(screen.getByText("Article A, Article B")).toBeDefined();
	});

	it("renders string values from array", () => {
		render(<ReferenceCell field={makeField()} value={["id-1", "id-2"]} />);
		expect(screen.getByText("id-1, id-2")).toBeDefined();
	});

	it("renders single string value", () => {
		render(<ReferenceCell field={makeField()} value="single-ref" />);
		expect(screen.getByText("single-ref")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<ReferenceCell field={makeField()} value={null} />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});

	it("renders empty cell value for empty array", () => {
		render(<ReferenceCell field={makeField()} value={[]} />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});
});
