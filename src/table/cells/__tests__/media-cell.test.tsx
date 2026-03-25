import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { MediaCell } from "../media-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "media",
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

describe("MediaCell", () => {
	it("renders file count for array", () => {
		render(<MediaCell field={makeField()} value={[{}, {}, {}]} />);
		expect(screen.getByText("3 files")).toBeDefined();
	});

	it("renders singular for 1 file", () => {
		render(<MediaCell field={makeField()} value={[{}]} />);
		expect(screen.getByText("1 file")).toBeDefined();
	});

	it("renders 1 file for single object", () => {
		render(<MediaCell field={makeField()} value={{ id: "1" }} />);
		expect(screen.getByText("1 file")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<MediaCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty array", () => {
		render(<MediaCell field={makeField()} value={[]} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
