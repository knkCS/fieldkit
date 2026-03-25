import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import type { ArraySettings } from "../../../schema/field-types/array";
import { ArrayCell } from "../array-cell";

const makeField = (overrides?: {
	settings?: ArraySettings;
	config?: Partial<Field["config"]>;
}): Field<ArraySettings> => ({
	field_type: "array",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: overrides?.settings ?? null,
	system: false,
});

describe("ArrayCell", () => {
	it("renders item count for dynamic mode", () => {
		render(<ArrayCell field={makeField()} value={["a", "b", "c"]} />);
		expect(screen.getByText("3 items")).toBeDefined();
	});

	it("renders singular for 1 item", () => {
		render(<ArrayCell field={makeField()} value={["a"]} />);
		expect(screen.getByText("1 item")).toBeDefined();
	});

	it("renders entry count for keyed mode", () => {
		render(
			<ArrayCell
				field={makeField({ settings: { mode: "keyed" } })}
				value={{ key1: "val1", key2: "val2" }}
			/>,
		);
		expect(screen.getByText("2 entries")).toBeDefined();
	});

	it("renders singular for 1 entry in keyed mode", () => {
		render(
			<ArrayCell
				field={makeField({ settings: { mode: "keyed" } })}
				value={{ key1: "val1" }}
			/>,
		);
		expect(screen.getByText("1 entry")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<ArrayCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
