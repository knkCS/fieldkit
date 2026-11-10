import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { expect } from "vitest";
import { z } from "zod";
import type { FieldProps, FieldTypePlugin } from "../../../schema/plugin";
import type { Field } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

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

export function makeCard(accessor: string, name = ""): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
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

export function makeDisabledFirstField(
	accessor: string,
	name = accessor,
): Field {
	return {
		field_type: "disabled-first",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		system: false,
	};
}

// Picker-style field whose first focusable child is DISABLED — pins the
// jump fallback's :disabled skip.
function DisabledFirstField({ field }: FieldProps) {
	const accessor = field.config.api_accessor;
	return (
		<div data-testid={`field-${accessor}`}>
			<label htmlFor={accessor}>{field.config.name}</label>
			<button type="button" disabled aria-label="disabled-control">
				locked
			</button>
			<button type="button" aria-label="enabled-control">
				pick
			</button>
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
		id: "card",
		name: "Card",
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
	{
		id: "disabled-first",
		name: "Disabled First",
		description: "",
		icon: () => null,
		category: "reference",
		fieldComponent: DisabledFirstField,
		toZodType: () => z.string(),
	},
];

export function Wrapper({
	children,
	defaultValues = {},
	extraPlugins = [],
}: {
	children: ReactNode;
	defaultValues?: Record<string, unknown>;
	extraPlugins?: FieldTypePlugin[];
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={[...testPlugins, ...extraPlugins]}>
					{children}
				</FieldKitProvider>
			</FormProvider>
		</ChakraProvider>
	);
}

/**
 * The classes of each stack of Fields, the form's (`field-renderer`) and read
 * mode's (`read-fields`), for one Spec — rendered in the same theme, so equal
 * styles mean equal classes. Compares the two layouts' rhythm (ADR-0030).
 */
export function fieldStackClasses(schema: Field[]): {
	form: string[];
	read: string[];
} {
	const edit = render(
		<Wrapper>
			<SpecForm schema={schema} />
		</Wrapper>,
	);
	const form = edit.getAllByTestId("field-renderer").map((el) => el.className);
	edit.unmount();
	const read = render(
		<Wrapper>
			<SpecForm schema={schema} mode="read" values={{}} />
		</Wrapper>,
	);
	const readClasses = read
		.getAllByTestId("read-fields")
		.map((el) => el.className);
	read.unmount();
	return { form, read: readClasses };
}

/** jsdom can't measure, so the layout is checked through the styles that
 * decide it: beside a vertical Tab list the panel takes the remaining width
 * (`flex: 1`) and may shrink below its content (`min-width: 0`), instead of
 * Chakra's `width: 100%` plus its start padding, which overflowed the
 * column into a rail beside it (fieldkit#435). */
export function expectPanelTakesRemainingWidth(panel: HTMLElement) {
	const style = getComputedStyle(panel);
	expect(style.flexGrow).toBe("1");
	expect(style.flexShrink).toBe("1");
	expect(style.minWidth).toBe("0");
	// Never the recipe's `width: 100%`: the panel is sized from what is left.
	expect(style.width).toBe("auto");
}
