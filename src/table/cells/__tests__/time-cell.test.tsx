import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { TimeCell } from "../time-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "time",
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

describe("TimeCell", () => {
	it("renders time value", () => {
		render(<TimeCell field={makeField()} value="14:30" />);
		expect(screen.getByText("14:30")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<TimeCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
