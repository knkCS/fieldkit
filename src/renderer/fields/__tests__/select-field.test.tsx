import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { SelectField } from "../select-field";

function Wrapper({
	children,
	defaultValues = { category: "" },
}: {
	children: React.ReactNode;
	defaultValues?: Record<string, unknown>;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>{children}</FormProvider>
		</ChakraProvider>
	);
}

describe("SelectField", () => {
	const singleField: Field = {
		field_type: "select",
		config: {
			name: "Category",
			api_accessor: "category",
			required: false,
			instructions: "Pick a category",
		},
		settings: {
			options: { news: "News", blog: "Blog", tutorial: "Tutorial" },
		},
		children: null,
		system: false,
	};

	const multiField: Field = {
		field_type: "select",
		config: {
			name: "Tags",
			api_accessor: "tags",
			required: false,
			instructions: "",
		},
		settings: {
			options: { js: "JavaScript", ts: "TypeScript", py: "Python" },
			multiple: true,
		},
		children: null,
		system: false,
	};

	const emptyField: Field = {
		field_type: "select",
		config: {
			name: "Empty",
			api_accessor: "empty",
			required: false,
			instructions: "",
		},
		settings: { options: {} },
		children: null,
		system: false,
	};

	it("renders single select with options", () => {
		render(
			<Wrapper>
				<SelectField field={singleField} />
			</Wrapper>,
		);
		expect(screen.getByLabelText(/Category/)).toBeInTheDocument();
		expect(screen.getByText("News")).toBeInTheDocument();
		expect(screen.getByText("Blog")).toBeInTheDocument();
		expect(screen.getByText("Tutorial")).toBeInTheDocument();
	});

	it("renders helper text from instructions", () => {
		render(
			<Wrapper>
				<SelectField field={singleField} />
			</Wrapper>,
		);
		expect(screen.getByText("Pick a category")).toBeInTheDocument();
	});

	it("renders multi select with options", () => {
		render(
			<Wrapper defaultValues={{ tags: [] }}>
				<SelectField field={multiField} />
			</Wrapper>,
		);
		expect(screen.getByText(/Tags/)).toBeInTheDocument();
		const select = screen.getByRole("listbox");
		expect(select).toHaveAttribute("multiple");
		expect(screen.getByText("JavaScript")).toBeInTheDocument();
		expect(screen.getByText("TypeScript")).toBeInTheDocument();
		expect(screen.getByText("Python")).toBeInTheDocument();
	});

	it("handles empty options", () => {
		render(
			<Wrapper defaultValues={{ empty: "" }}>
				<SelectField field={emptyField} />
			</Wrapper>,
		);
		expect(screen.getByLabelText(/Empty/)).toBeInTheDocument();
	});

	it("renders readOnly for single select", () => {
		render(
			<Wrapper>
				<SelectField field={singleField} readOnly />
			</Wrapper>,
		);
		expect(screen.getByLabelText(/Category/)).toBeInTheDocument();
	});

	it("disables multi select when readOnly", () => {
		render(
			<Wrapper defaultValues={{ tags: [] }}>
				<SelectField field={multiField} readOnly />
			</Wrapper>,
		);
		const select = screen.getByRole("listbox");
		expect(select).toBeDisabled();
	});

	it("has displayName", () => {
		expect(SelectField.displayName).toBe("SelectField");
	});
});
