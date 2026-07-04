import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { z } from "zod";
import type { FieldProps, FieldTypePlugin } from "../../../schema/plugin";
import type { Field } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";

export function makeField(accessor: string, name = accessor): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		system: false,
	};
}

export function makeSection(
	accessor: string,
	name = accessor,
	orientation?: "horizontal" | "vertical",
): Field {
	return {
		field_type: "section",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: orientation ? { orientation } : {},
		system: false,
	};
}

export function makePickerField(accessor: string, name = accessor): Field {
	return {
		field_type: "picker",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		system: false,
	};
}

function TestField({ field }: FieldProps) {
	const { register } = useFormContext();
	return (
		<input
			data-testid={`field-${field.config.api_accessor}`}
			aria-label={field.config.name}
			{...register(field.config.api_accessor)}
		/>
	);
}

// Stands in for Controller-based fields (reference, media, select) whose
// interactive control is not a plain registered input: no `name` attribute
// anywhere, and the anker-style `<label htmlFor>` is a sibling of the
// control rather than wrapping it directly.
function PickerField({ field }: FieldProps) {
	const accessor = field.config.api_accessor;
	return (
		<div data-testid={`field-${accessor}`}>
			<label htmlFor={accessor}>{field.config.name}</label>
			<div>
				<button aria-label="pick" type="button">
					Pick
				</button>
			</div>
		</div>
	);
}

export const testPlugins: FieldTypePlugin[] = [
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
	{
		id: "picker",
		name: "Picker",
		description: "",
		icon: () => null,
		category: "reference",
		fieldComponent: PickerField,
		toZodType: () => z.string(),
	},
];

export function Wrapper({
	children,
	defaultValues = {},
}: {
	children: ReactNode;
	defaultValues?: Record<string, unknown>;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={testPlugins}>{children}</FieldKitProvider>
			</FormProvider>
		</ChakraProvider>
	);
}
