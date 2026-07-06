import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field, Schema } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

function textField(accessor: string, required: boolean): Field {
	return {
		field_type: "text",
		config: {
			name: accessor,
			api_accessor: accessor,
			required,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

function sectionField(accessor: string): Field {
	return {
		field_type: "section",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: {},
		system: false,
	};
}

function RealWrapper({ children }: { children: ReactNode }) {
	const methods = useForm({ defaultValues: { a: "", b: "", c: "" } });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={builtInFieldTypes}>
					{children}
				</FieldKitProvider>
			</FormProvider>
		</ChakraProvider>
	);
}

const mostlyRequired: Schema = [
	textField("a", true),
	textField("b", true),
	textField("c", false),
];
const mostlyOptional: Schema = [
	textField("a", true),
	textField("b", false),
	textField("c", false),
];

describe("SpecForm — §10 marker convention", () => {
	it("mostly-required: marks optionals, suppresses all asterisks", () => {
		render(
			<RealWrapper>
				<SpecForm schema={mostlyRequired} />
			</RealWrapper>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});

	it("mostly-optional: asterisk on the required field, no optional marker", () => {
		render(
			<RealWrapper>
				<SpecForm schema={mostlyOptional} />
			</RealWrapper>,
		);
		expect(screen.getByText("*")).toBeInTheDocument();
		expect(screen.queryByText("(optional)")).toBeNull();
	});

	it("labels.optionalMarker overrides the marker text", () => {
		render(
			<RealWrapper>
				<SpecForm
					schema={mostlyRequired}
					labels={{ optionalMarker: "(optioneel)" }}
				/>
			</RealWrapper>,
		);
		expect(screen.getByText("(optioneel)")).toBeInTheDocument();
		expect(screen.queryByText("(optional)")).toBeNull();
	});

	it("read mode renders no markers", () => {
		render(
			<RealWrapper>
				<SpecForm schema={mostlyRequired} mode="read" values={{}} />
			</RealWrapper>,
		);
		expect(screen.queryByText("(optional)")).toBeNull();
		expect(screen.queryByText("*")).toBeNull();
	});

	it("applies the convention through the sectioned tabs path", () => {
		render(
			<RealWrapper>
				<SpecForm schema={[sectionField("s1"), ...mostlyRequired]} />
			</RealWrapper>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});
});
