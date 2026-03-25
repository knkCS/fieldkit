import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { BooleanCell } from "../boolean-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "boolean",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("BooleanCell", () => {
	it("renders Yes for true", () => {
		render(<BooleanCell field={makeField()} value={true} />);
		expect(screen.getByText("Yes")).toBeDefined();
	});

	it("renders No for false", () => {
		render(<BooleanCell field={makeField()} value={false} />);
		expect(screen.getByText("No")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<BooleanCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
