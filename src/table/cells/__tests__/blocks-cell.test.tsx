import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { BlocksCell } from "../blocks-cell";

const makeField = (
	allowedBlocks: Array<{ type: string; name: string; fields: Field[] }> = [],
): Field => ({
	field_type: "blocks",
	config: {
		name: "Content Blocks",
		api_accessor: "blocks",
		required: false,
		instructions: "",
	},
	settings: { allowed_blocks: allowedBlocks },
	children: null,
	system: false,
});

describe("BlocksCell", () => {
	const allowedBlocks = [
		{ type: "heading", name: "Heading", fields: [] },
		{ type: "paragraph", name: "Paragraph", fields: [] },
		{ type: "image", name: "Image", fields: [] },
		{ type: "quote", name: "Quote", fields: [] },
	];

	it("renders dash for null value", () => {
		render(<BlocksCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders dash for undefined value", () => {
		render(<BlocksCell field={makeField()} value={undefined} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders dash for non-array value", () => {
		render(<BlocksCell field={makeField()} value="not-an-array" />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders singular '1 block' for single block", () => {
		const value = [{ _type: "heading" }];
		render(<BlocksCell field={makeField(allowedBlocks)} value={value} />);
		expect(screen.getByText(/1 block\b/)).toBeDefined();
	});

	it("renders plural '2 blocks' for multiple blocks", () => {
		const value = [{ _type: "heading" }, { _type: "paragraph" }];
		render(<BlocksCell field={makeField(allowedBlocks)} value={value} />);
		expect(screen.getByText(/2 blocks/)).toBeDefined();
	});

	it("shows top 3 block type names", () => {
		const value = [
			{ _type: "heading" },
			{ _type: "paragraph" },
			{ _type: "image" },
		];
		render(<BlocksCell field={makeField(allowedBlocks)} value={value} />);
		expect(screen.getByText(/Heading, Paragraph, Image/)).toBeDefined();
	});

	it("shows '+N more' suffix when more than 3 blocks", () => {
		const value = [
			{ _type: "heading" },
			{ _type: "paragraph" },
			{ _type: "image" },
			{ _type: "quote" },
		];
		render(<BlocksCell field={makeField(allowedBlocks)} value={value} />);
		expect(screen.getByText(/\+1 more/)).toBeDefined();
	});

	it("shows 'unknown' for blocks without _type property", () => {
		const value = [{ content: "no type here" }];
		render(<BlocksCell field={makeField()} value={value} />);
		expect(screen.getByText(/unknown/)).toBeDefined();
	});

	it("uses raw type string when no allowed_blocks name is found", () => {
		const value = [{ _type: "custom_block" }];
		render(<BlocksCell field={makeField()} value={value} />);
		expect(screen.getByText(/custom_block/)).toBeDefined();
	});

	it("renders 0 blocks with empty array", () => {
		render(<BlocksCell field={makeField()} value={[]} />);
		expect(screen.getByText("0 blocks")).toBeDefined();
	});

	it("has displayName", () => {
		expect(BlocksCell.displayName).toBe("BlocksCell");
	});
});
