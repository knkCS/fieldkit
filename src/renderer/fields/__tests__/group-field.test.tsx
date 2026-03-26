import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";
import { GroupField } from "../group-field";

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
	defaultValues = { items: [] },
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

describe("GroupField", () => {
	const childFields: Field[] = [
		{
			field_type: "text",
			config: {
				name: "Name",
				api_accessor: "name",
				required: true,
				instructions: "",
			},
			children: null,
			system: false,
		},
	];

	const field: Field = {
		field_type: "group",
		config: {
			name: "Team Members",
			api_accessor: "items",
			required: false,
			instructions: "Add team members",
		},
		settings: {},
		children: childFields,
		system: false,
	};

	it("renders empty state when no items exist", () => {
		render(
			<Wrapper>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText("No items added yet.")).toBeInTheDocument();
	});

	it("renders Add item button when not readOnly", () => {
		render(
			<Wrapper>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByRole("button", { name: /Add item/ }),
		).toBeInTheDocument();
	});

	it("hides Add item button when readOnly", () => {
		render(
			<Wrapper>
				<GroupField field={field} readOnly />
			</Wrapper>,
		);
		expect(
			screen.queryByRole("button", { name: /Add item/ }),
		).not.toBeInTheDocument();
	});

	it("renders existing items with item labels", () => {
		render(
			<Wrapper
				defaultValues={{
					items: [{ name: "Alice" }, { name: "Bob" }],
				}}
			>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText("Item 1")).toBeInTheDocument();
		expect(screen.getByText("Item 2")).toBeInTheDocument();
	});

	it("renders nested fields via FieldRenderer", () => {
		render(
			<Wrapper
				defaultValues={{
					items: [{ name: "Alice" }],
				}}
			>
				<GroupField field={field} />
			</Wrapper>,
		);
		// FieldRenderer renders each child field through FieldComponent
		expect(screen.getByTestId("field-renderer")).toBeInTheDocument();
	});

	it("hides remove buttons when readOnly", () => {
		render(
			<Wrapper
				defaultValues={{
					items: [{ name: "Alice" }, { name: "Bob" }],
				}}
			>
				<GroupField field={field} readOnly />
			</Wrapper>,
		);
		expect(
			screen.queryByRole("button", { name: /Remove item/ }),
		).not.toBeInTheDocument();
	});

	it("shows remove buttons for each item", () => {
		render(
			<Wrapper
				defaultValues={{
					items: [{ name: "Alice" }, { name: "Bob" }],
				}}
			>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByRole("button", { name: "Remove item 1" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove item 2" }),
		).toBeInTheDocument();
	});

	it("renders label and helper text", () => {
		render(
			<Wrapper>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText(/Team Members/)).toBeInTheDocument();
		expect(screen.getByText("Add team members")).toBeInTheDocument();
	});

	it("has displayName", () => {
		expect(GroupField.displayName).toBe("GroupField");
	});
});
