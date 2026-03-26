import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { EmailCell } from "../email-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "email",
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

describe("EmailCell", () => {
	it("renders email text", () => {
		render(<EmailCell field={makeField()} value="user@example.com" />);
		expect(screen.getByText("user@example.com")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<EmailCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
