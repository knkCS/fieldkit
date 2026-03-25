import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { GroupCell } from "../group-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "group",
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

describe("GroupCell", () => {
	it("renders item count", () => {
		render(<GroupCell field={makeField()} value={[{}, {}, {}]} />);
		expect(screen.getByText("3 items")).toBeDefined();
	});

	it("renders singular for 1 item", () => {
		render(<GroupCell field={makeField()} value={[{}]} />);
		expect(screen.getByText("1 item")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<GroupCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for non-array", () => {
		render(<GroupCell field={makeField()} value="not-array" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
