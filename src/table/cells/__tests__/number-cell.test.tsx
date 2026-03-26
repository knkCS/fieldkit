import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { NumberCell } from "../number-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "number",
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

describe("NumberCell", () => {
	it("renders a formatted number", () => {
		render(<NumberCell field={makeField()} value={1234} />);
		expect(screen.getByText(/1.*234/)).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<NumberCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders string fallback for NaN", () => {
		render(<NumberCell field={makeField()} value="abc" />);
		expect(screen.getByText("abc")).toBeDefined();
	});
});
