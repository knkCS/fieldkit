import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { BlocksSettings } from "../../../schema/field-types/blocks";
import type { Field } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";
import { BlocksField } from "../blocks-field";

const textPlugin = {
	id: "text",
	name: "Text",
	description: "A text field",
	icon: () => null,
	category: "text" as const,
	fieldComponent: ({ field }: { field: Field }) => (
		<input data-testid={`text-${field.config.api_accessor}`} />
	),
	toZodType: () => {
		const { z } = require("zod");
		return z.string();
	},
};

function Wrapper({
	children,
	defaultValues = { blocks: [] },
}: {
	children: React.ReactNode;
	defaultValues?: Record<string, unknown>;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[textPlugin]}>
				<FormProvider {...methods}>{children}</FormProvider>
			</FieldKitProvider>
		</ChakraProvider>
	);
}

describe("BlocksField", () => {
	const allowedBlocks: BlocksSettings["allowed_blocks"] = [
		{
			type: "heading",
			name: "Heading",
			fields: [
				{
					field_type: "text",
					config: {
						name: "Title",
						api_accessor: "title",
						required: true,
						instructions: "",
					},
					children: null,
					system: false,
				},
			],
		},
		{
			type: "paragraph",
			name: "Paragraph",
			fields: [
				{
					field_type: "text",
					config: {
						name: "Body",
						api_accessor: "body",
						required: false,
						instructions: "",
					},
					children: null,
					system: false,
				},
			],
		},
	];

	const field: Field = {
		field_type: "blocks",
		config: {
			name: "Content Blocks",
			api_accessor: "blocks",
			required: false,
			instructions: "Add content blocks",
		},
		settings: { allowed_blocks: allowedBlocks },
		children: null,
		system: false,
	};

	it("renders empty state when no blocks exist", () => {
		render(
			<Wrapper>
				<BlocksField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText("No blocks added yet.")).toBeInTheDocument();
	});

	it("renders Add block button when not readOnly", () => {
		render(
			<Wrapper>
				<BlocksField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByRole("button", { name: /Add block/ }),
		).toBeInTheDocument();
	});

	it("hides Add block button when readOnly", () => {
		render(
			<Wrapper>
				<BlocksField field={field} readOnly />
			</Wrapper>,
		);
		expect(
			screen.queryByRole("button", { name: /Add block/ }),
		).not.toBeInTheDocument();
	});

	it("renders existing blocks", () => {
		render(
			<Wrapper
				defaultValues={{
					blocks: [
						{ _type: "heading", title: "Hello" },
						{ _type: "paragraph", body: "World" },
					],
				}}
			>
				<BlocksField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText("Heading")).toBeInTheDocument();
		expect(screen.getByText("Paragraph")).toBeInTheDocument();
	});

	it("shows block type picker when Add block is clicked", async () => {
		const user = userEvent.setup();
		render(
			<Wrapper>
				<BlocksField field={field} />
			</Wrapper>,
		);

		await user.click(screen.getByRole("button", { name: /Add block/ }));

		// The picker should show block type options
		expect(screen.getByRole("button", { name: "Heading" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Paragraph" }),
		).toBeInTheDocument();
	});

	it("hides controls (remove, move) when readOnly", () => {
		render(
			<Wrapper
				defaultValues={{
					blocks: [
						{ _type: "heading", title: "Hello" },
						{ _type: "paragraph", body: "World" },
					],
				}}
			>
				<BlocksField field={field} readOnly />
			</Wrapper>,
		);

		expect(
			screen.queryByRole("button", { name: /Remove block/ }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Move up/ }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Move down/ }),
		).not.toBeInTheDocument();
	});

	it("renders label and helper text", () => {
		render(
			<Wrapper>
				<BlocksField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText(/Content Blocks/)).toBeInTheDocument();
		expect(screen.getByText("Add content blocks")).toBeInTheDocument();
	});

	it("has displayName", () => {
		expect(BlocksField.displayName).toBe("BlocksField");
	});
});
