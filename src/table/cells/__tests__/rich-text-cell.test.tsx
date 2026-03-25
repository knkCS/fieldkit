import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { RichTextCell } from "../rich-text-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "rich_text",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("RichTextCell", () => {
	it("extracts text from ProseMirror JSON", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
			],
		};
		render(<RichTextCell field={makeField()} value={doc} />);
		expect(screen.getByText("Hello world")).toBeDefined();
	});

	it("renders plain string value", () => {
		render(<RichTextCell field={makeField()} value="Plain text" />);
		expect(screen.getByText("Plain text")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<RichTextCell field={makeField()} value={null} />);
		expect(screen.getByText("\u2014")).toBeDefined();
	});
});
