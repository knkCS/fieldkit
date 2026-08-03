import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FieldsetSettings } from "../../../schema/field-types/fieldset";
import type { Field } from "../../../schema/types";
import { FieldsetCell } from "../fieldset-cell";

const field: Field<FieldsetSettings> = {
	field_type: "fieldset",
	config: {
		name: "Address",
		api_accessor: "address",
		required: false,
		instructions: "",
	},
	settings: { blueprint: "address_bp" },
	system: false,
};

describe("FieldsetCell", () => {
	it("renders the record's values in order", () => {
		render(
			<FieldsetCell
				field={field}
				value={{ street: "12 Bridge Lane", city: "Ely" }}
			/>,
		);
		expect(screen.getByText("12 Bridge Lane, Ely")).toBeDefined();
	});

	it("renders numbers and booleans alongside strings", () => {
		render(
			<FieldsetCell field={field} value={{ floor: 3, primary: true }} />, //
		);
		expect(screen.getByText("3, true")).toBeDefined();
	});

	it("skips blank and container values", () => {
		render(
			<FieldsetCell
				field={field}
				value={{
					street: "12 Bridge Lane",
					city: "   ",
					tags: ["a", "b"],
					meta: { note: "hidden" },
					county: null,
				}}
			/>,
		);
		expect(screen.getByText("12 Bridge Lane")).toBeDefined();
	});

	it("renders the empty cell value for an empty record", () => {
		render(<FieldsetCell field={field} value={{}} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders the empty cell value for an absent record", () => {
		render(<FieldsetCell field={field} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders the empty cell value for a non-record value", () => {
		render(<FieldsetCell field={field} value={["12 Bridge Lane"]} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("has displayName", () => {
		expect(FieldsetCell.displayName).toBe("FieldsetCell");
	});
});
