import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { VirtualTableCell } from "../virtual-table-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "virtual_table",
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

describe("VirtualTableCell", () => {
	it("renders row count", () => {
		render(<VirtualTableCell field={makeField()} value={[{}, {}, {}]} />);
		expect(screen.getByText("3 rows")).toBeDefined();
	});

	it("renders singular for 1 row", () => {
		render(<VirtualTableCell field={makeField()} value={[{}]} />);
		expect(screen.getByText("1 row")).toBeDefined();
	});

	it("renders 0 rows for empty array", () => {
		render(<VirtualTableCell field={makeField()} value={[]} />);
		expect(screen.getByText("0 rows")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<VirtualTableCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for non-array", () => {
		render(<VirtualTableCell field={makeField()} value="not-array" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
