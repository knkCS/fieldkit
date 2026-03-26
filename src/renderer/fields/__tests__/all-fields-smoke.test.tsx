import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";

function Wrapper({ children }: { children: React.ReactNode }) {
	const methods = useForm({ defaultValues: {} });
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={builtInFieldTypes}>
				<FormProvider {...methods}>{children}</FormProvider>
			</FieldKitProvider>
		</ChakraProvider>
	);
}

const fieldTypes = builtInFieldTypes
	.filter((p) => p.id !== "section") // Section renders null — tested separately
	.map((p) => p.id);

describe.each(fieldTypes)("Field type: %s", (fieldType) => {
	it("should render without crashing", () => {
		const field: Field = {
			field_type: fieldType,
			config: {
				name: `Test ${fieldType}`,
				api_accessor: `test_${fieldType}`,
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};

		const { container } = render(
			<Wrapper>
				<FieldComponent field={field} />
			</Wrapper>,
		);
		expect(container).toBeTruthy();
	});
});
