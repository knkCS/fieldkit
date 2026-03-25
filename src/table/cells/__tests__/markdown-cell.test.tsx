import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { MarkdownCell } from "../markdown-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "markdown",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("MarkdownCell", () => {
	it("strips markdown and renders text", () => {
		render(<MarkdownCell field={makeField()} value="## Hello **world**" />);
		expect(screen.getByText("Hello world")).toBeDefined();
	});

	it("strips links", () => {
		render(<MarkdownCell field={makeField()} value="[click here](http://example.com)" />);
		expect(screen.getByText("click here")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<MarkdownCell field={makeField()} value={null} />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<MarkdownCell field={makeField()} value="" />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});
});
