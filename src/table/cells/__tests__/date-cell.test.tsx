import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { DateCell } from "../date-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "date",
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

describe("DateCell", () => {
	it("renders a formatted date", () => {
		render(<DateCell field={makeField()} value="2026-03-25" />);
		expect(screen.getByText("Mar 25, 2026")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<DateCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for invalid date", () => {
		render(<DateCell field={makeField()} value="not-a-date" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
