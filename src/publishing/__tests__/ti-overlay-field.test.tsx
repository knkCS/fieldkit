import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field } from "../../schema/types";
import { publishingFieldTypes, TiOverlayCell, TiOverlayField } from "..";

const overlay = {
	field_type: "ti_overlay",
	config: {
		name: "Typesetting",
		api_accessor: "ti",
		required: false,
		instructions: "",
	},
	settings: { ti_set: "tis-1" },
	system: false,
} as Field;

const value = {
	entries: [
		{
			_id: "e1",
			anchor: { node: "12", offset: 3, before: "abc", after: "def" },
			command: "np",
			source: "editor",
		},
	],
};

function Form() {
	const methods = useForm({ defaultValues: { ti: value } });
	return (
		<FormProvider {...methods}>
			<TiOverlayField field={overlay} />
		</FormProvider>
	);
}

describe("TiOverlayField", () => {
	it("edits each entry through the built-in Fieldset and Group", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider
					plugins={[...builtInFieldTypes, ...publishingFieldTypes]}
				>
					<Form />
				</FieldKitProvider>
			</ChakraProvider>,
		);
		expect(screen.getByText("Typesetting")).toBeInTheDocument();
		expect(screen.getByDisplayValue("np")).toBeInTheDocument();
		expect(screen.getByDisplayValue("12")).toBeInTheDocument();
	});

	it("counts the entries in a cell", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TiOverlayCell field={overlay} value={value} />
			</ChakraProvider>,
		);
		expect(screen.getByText(/1/)).toBeInTheDocument();
	});
});
