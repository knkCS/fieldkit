import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SelectSettings } from "../../../schema/field-types/select";
import type { Field } from "../../../schema/types";
import { SelectCell } from "../select-cell";

const makeField = (overrides?: {
	settings?: SelectSettings;
	config?: Partial<Field["config"]>;
}): Field<SelectSettings> => ({
	field_type: "select",
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

describe("SelectCell", () => {
	const options = [
		{ key: "draft", label: "Draft" },
		{ key: "published", label: "Published" },
		{ key: "archived", label: "Archived" },
	];

	it("renders label for single value", () => {
		render(
			<SelectCell
				field={makeField({ settings: { options } })}
				value="published"
			/>,
		);
		expect(screen.getByText("Published")).toBeDefined();
	});

	it("renders labels for multi-select array", () => {
		render(
			<SelectCell
				field={makeField({ settings: { options } })}
				value={["draft", "published"]}
			/>,
		);
		expect(screen.getByText("Draft, Published")).toBeDefined();
	});

	it("lists a multi-select's labels in the options' order, unknown keys last", () => {
		render(
			<SelectCell
				field={makeField({ settings: { options, multiple: true } })}
				value={["gone", "archived", "draft"]}
			/>,
		);
		expect(screen.getByText("Draft, Archived, gone")).toBeDefined();
	});

	it("falls back to raw value if no option match", () => {
		render(
			<SelectCell
				field={makeField({ settings: { options } })}
				value="unknown"
			/>,
		);
		expect(screen.getByText("unknown")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(
			<SelectCell field={makeField({ settings: { options } })} value={null} />,
		);
		expect(screen.getByText("\u2014")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(
			<SelectCell field={makeField({ settings: { options } })} value="" />,
		);
		expect(screen.getByText("\u2014")).toBeDefined();
	});
});
