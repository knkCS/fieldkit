import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ListSettings } from "../../../schema/field-types/list";
import type { Field } from "../../../schema/types";
import { ListCell } from "../list-cell";

const field: Field<ListSettings> = {
	field_type: "list",
	config: {
		name: "Keywords",
		api_accessor: "keywords",
		required: false,
		instructions: "",
	},
	settings: {},
	system: false,
};

describe("ListCell", () => {
	it("renders the entries in order", () => {
		render(<ListCell field={field} value={["alpha", "beta", "gamma"]} />);
		expect(screen.getByText("alpha, beta, gamma")).toBeDefined();
	});

	it("renders the empty cell value for an empty list", () => {
		render(<ListCell field={field} value={[]} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders the empty cell value for an absent list", () => {
		render(<ListCell field={field} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders the empty cell value for a non-array value", () => {
		render(<ListCell field={field} value="alpha" />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("has displayName", () => {
		expect(ListCell.displayName).toBe("ListCell");
	});
});
