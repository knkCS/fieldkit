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

/**
 * A cell has neither Adapter access nor async, so it cannot resolve a name.
 * A count is the one thing that reads correctly at table density.
 */
describe("ReferenceCell", () => {
	it("counts the References", () => {
		render(
			<ReferenceCell
				field={makeField()}
				value={[{ id: "article-1" }, { id: "article-2" }]}
			/>,
		);
		expect(screen.getByText("2 references")).toBeDefined();
	});

	it("says one reference in the singular", () => {
		render(<ReferenceCell field={makeField()} value={[{ id: "article-1" }]} />);
		expect(screen.getByText("1 reference")).toBeDefined();
	});

	it("counts the parts a later ticket fills in as one Reference each", () => {
		render(
			<ReferenceCell
				field={makeField()}
				value={[
					{ id: "article-1", pin: "v3", attributes: { page: "12" } },
					{ id: "article-2" },
				]}
			/>,
		);
		expect(screen.getByText("2 references")).toBeDefined();
	});

	it("renders an empty cell for an empty list", () => {
		render(<ReferenceCell field={makeField()} value={[]} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders an empty cell for null", () => {
		render(<ReferenceCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders an empty cell for a value that is not a list of References", () => {
		// Form data is only as well-formed as whatever produced it, so a cell
		// must not render "[object Object]" — or throw — on a stale shape.
		render(<ReferenceCell field={makeField()} value="single-ref" />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("ignores entries that are not References", () => {
		render(
			<ReferenceCell
				field={makeField()}
				value={[{ id: "article-1" }, "loose-id", null]}
			/>,
		);
		expect(screen.getByText("1 reference")).toBeDefined();
	});
});
