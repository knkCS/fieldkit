// src/renderer/__tests__/field-component.test.tsx

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { FieldComponent } from "../field-component";
import { FieldKitProvider } from "../provider";

function TestTextField({ field }: FieldProps) {
	return (
		<input
			data-testid={`field-${field.config.api_accessor}`}
			placeholder={field.config.name}
		/>
	);
}

const textPlugin: FieldTypePlugin = {
	id: "text",
	name: "Text",
	description: "",
	icon: () => null,
	category: "text",
	fieldComponent: TestTextField,
	toZodType: () => z.string(),
};

function Wrapper({ children }: { children: React.ReactNode }) {
	const methods = useForm({ defaultValues: { name: "" } });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={[textPlugin]}>{children}</FieldKitProvider>
			</FormProvider>
		</ChakraProvider>
	);
}

describe("FieldComponent", () => {
	const field: Field = {
		field_type: "text",
		config: {
			name: "Name",
			api_accessor: "name",
			required: true,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
	};

	it("should render the plugin's field component", () => {
		render(
			<Wrapper>
				<FieldComponent field={field} />
			</Wrapper>,
		);
		expect(screen.getByTestId("field-name")).toBeInTheDocument();
	});

	it("should not render hidden fields", () => {
		const hiddenField: Field = {
			...field,
			config: { ...field.config, hidden: true },
		};
		render(
			<Wrapper>
				<FieldComponent field={hiddenField} />
			</Wrapper>,
		);
		expect(screen.queryByTestId("field-name")).not.toBeInTheDocument();
	});

	it("should render fallback for unknown field types", () => {
		const unknownField: Field = {
			...field,
			field_type: "unknown_type",
		};
		render(
			<Wrapper>
				<FieldComponent field={unknownField} />
			</Wrapper>,
		);
		expect(screen.getByText(/unknown field type/i)).toBeInTheDocument();
	});

	it("should re-render when given a new field object with the same accessor/type (editor live preview)", () => {
		const { rerender } = render(
			<Wrapper>
				<FieldComponent field={field} />
			</Wrapper>,
		);
		expect(screen.getByTestId("field-name")).toHaveAttribute(
			"placeholder",
			"Name",
		);

		// A panel edit (e.g. renaming the field) produces a brand-new Field
		// object with the same api_accessor/field_type. A comparator keyed
		// only on those two properties would treat this as "no change" and
		// skip the re-render, so the canvas would never reflect edits.
		const renamed: Field = {
			...field,
			config: { ...field.config, name: "Renamed" },
		};
		rerender(
			<Wrapper>
				<FieldComponent field={renamed} />
			</Wrapper>,
		);
		expect(screen.getByTestId("field-name")).toHaveAttribute(
			"placeholder",
			"Renamed",
		);
	});
});
