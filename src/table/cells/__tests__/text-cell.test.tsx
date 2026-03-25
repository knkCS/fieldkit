import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { TextCell } from "../text-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "text",
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

describe("TextCell", () => {
	it("renders text value", () => {
		render(<TextCell field={makeField()} value="Hello world" />);
		expect(screen.getByText("Hello world")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<TextCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
