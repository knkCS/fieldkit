import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import type { CheckboxesSettings } from "../../../schema/field-types/checkboxes";
import { CheckboxesCell } from "../checkboxes-cell";

const makeField = (overrides?: {
	settings?: CheckboxesSettings;
	config?: Partial<Field["config"]>;
}): Field<CheckboxesSettings> => ({
	field_type: "checkboxes",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: overrides?.settings ?? null,
	system: false,
});

describe("CheckboxesCell", () => {
	const options = { js: "JavaScript", ts: "TypeScript", py: "Python" };

	it("renders labels for selected values", () => {
		render(<CheckboxesCell field={makeField({ settings: { options } })} value={["js", "ts"]} />);
		expect(screen.getByText("JavaScript, TypeScript")).toBeDefined();
	});

	it("falls back to raw value if no option match", () => {
		render(<CheckboxesCell field={makeField({ settings: { options } })} value={["go"]} />);
		expect(screen.getByText("go")).toBeDefined();
	});

	it("renders empty cell value for empty array", () => {
		render(<CheckboxesCell field={makeField({ settings: { options } })} value={[]} />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<CheckboxesCell field={makeField({ settings: { options } })} value={null} />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});
});
