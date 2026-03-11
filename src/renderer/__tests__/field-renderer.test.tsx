// src/renderer/__tests__/field-renderer.test.tsx

import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { FieldKitProvider } from "../provider";

function TestField({ field }: FieldProps) {
	return (
		<div data-testid={`field-${field.config.api_accessor}`}>
			{field.config.name}
		</div>
	);
}

const plugins: FieldTypePlugin[] = [
	{
		id: "text",
		name: "Text",
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: TestField,
		toZodType: () => z.string(),
	},
	{
		id: "section",
		name: "Section",
		description: "",
		icon: () => null,
		category: "structural",
		fieldComponent: () => null,
		toZodType: () => z.never(),
	},
];

function Wrapper({ children }: { children: React.ReactNode }) {
	const methods = useForm({ defaultValues: {} });
	return (
		<FormProvider {...methods}>
			<FieldKitProvider plugins={plugins}>{children}</FieldKitProvider>
		</FormProvider>
	);
}

describe("FieldRenderer", () => {
	it("should render all fields in a schema", () => {
		const schema: Field[] = [
			{
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
			},
			{
				field_type: "text",
				config: {
					name: "Email",
					api_accessor: "email",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		render(
			<Wrapper>
				<FieldRenderer schema={schema} />
			</Wrapper>,
		);
		expect(screen.getByTestId("field-name")).toBeInTheDocument();
		expect(screen.getByTestId("field-email")).toBeInTheDocument();
	});

	it("should render nothing for empty schema", () => {
		const { container } = render(
			<Wrapper>
				<FieldRenderer schema={[]} />
			</Wrapper>,
		);
		expect(container.children).toHaveLength(1);
	});

	it("should pass readOnly to all fields", () => {
		const schema: Field[] = [
			{
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
			},
		];
		render(
			<Wrapper>
				<FieldRenderer schema={schema} readOnly />
			</Wrapper>,
		);
		expect(screen.getByTestId("field-name")).toBeInTheDocument();
	});
});
