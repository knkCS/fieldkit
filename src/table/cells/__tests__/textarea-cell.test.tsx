import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { TextareaCell } from "../textarea-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "textarea",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("TextareaCell", () => {
	it("renders text value", () => {
		render(<TextareaCell field={makeField()} value="Short text" />);
		expect(screen.getByText("Short text")).toBeDefined();
	});

	it("truncates long text", () => {
		const long = "x".repeat(150);
		render(<TextareaCell field={makeField()} value={long} />);
		expect(screen.queryByText(long)).toBeNull();
	});

	it("renders empty cell value for null", () => {
		render(<TextareaCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
