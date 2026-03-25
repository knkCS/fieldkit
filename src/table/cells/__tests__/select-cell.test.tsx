import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import type { SelectSettings } from "../../../schema/field-types/select";
import { SelectCell } from "../select-cell";

const makeField = (overrides?: {
	settings?: SelectSettings;
	config?: Partial<Field["config"]>;
}): Field<SelectSettings> => ({
	field_type: "select",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: overrides?.settings ?? null,
	system: false,
});

describe("SelectCell", () => {
	const options = { draft: "Draft", published: "Published", archived: "Archived" };

	it("renders label for single value", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value="published" />);
		expect(screen.getByText("Published")).toBeDefined();
	});

	it("renders labels for multi-select array", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value={["draft", "published"]} />);
		expect(screen.getByText("Draft, Published")).toBeDefined();
	});

	it("falls back to raw value if no option match", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value="unknown" />);
		expect(screen.getByText("unknown")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value={null} />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value="" />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});
});
