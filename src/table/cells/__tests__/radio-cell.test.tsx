import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RadioSettings } from "../../../schema/field-types/radio";
import type { Field } from "../../../schema/types";
import { RadioCell } from "../radio-cell";

const makeField = (overrides?: {
	settings?: RadioSettings;
	config?: Partial<Field["config"]>;
}): Field<RadioSettings> => ({
	field_type: "radio",
	config: {
		name: "Test",
		api_accessor: "test",
		required: false,
		instructions: "",
		...overrides?.config,
	},
	settings: overrides?.settings ?? null,
	system: false,
});

describe("RadioCell", () => {
	const options = { sm: "Small", md: "Medium", lg: "Large" };

	it("renders label for selected value", () => {
		render(
			<RadioCell field={makeField({ settings: { options } })} value="md" />,
		);
		expect(screen.getByText("Medium")).toBeDefined();
	});

	it("falls back to raw value if no option match", () => {
		render(
			<RadioCell field={makeField({ settings: { options } })} value="xl" />,
		);
		expect(screen.getByText("xl")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(
			<RadioCell field={makeField({ settings: { options } })} value={null} />,
		);
		expect(screen.getByText("\u2014")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<RadioCell field={makeField({ settings: { options } })} value="" />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});
});
