import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { CheckboxesField } from "../checkboxes-field";
import { RadioField } from "../radio-field";
import { SelectField } from "../select-field";

/**
 * List order is display order (ADR-0028). Integer-like Keys are the case a
 * key-to-label map could not hold: JavaScript moves them to the front in
 * numeric order, so "12, 1, 2" would have shown as "1, 2, 12".
 */
const OPTIONS = [
	{ key: "12", label: "December" },
	{ key: "1", label: "January" },
	{ key: "2", label: "February" },
	{ key: "later", label: "Later" },
];

function field(type: string): Field {
	return {
		field_type: type,
		config: {
			name: "Month",
			api_accessor: "month",
			required: false,
			instructions: "",
		},
		settings: { options: OPTIONS },
		system: false,
	};
}

function Wrapper({ children }: { children: React.ReactNode }) {
	const methods = useForm({ defaultValues: { month: "" } });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>{children}</FormProvider>
		</ChakraProvider>
	);
}

const LABELS = OPTIONS.map((o) => o.label);

/** The labels among `names`, in document order. */
function inDocumentOrder(names: string[]): string[] {
	return screen
		.getAllByText((_, node) => !!node && names.includes(node.textContent ?? ""))
		.filter((node) => node.children.length === 0)
		.map((node) => node.textContent ?? "");
}

describe("choice controls show the Options in list order", () => {
	it("radio", () => {
		render(
			<Wrapper>
				<RadioField field={field("radio")} />
			</Wrapper>,
		);
		expect(
			screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value),
		).toEqual(["12", "1", "2", "later"]);
	});

	it("checkboxes", () => {
		render(
			<Wrapper>
				<CheckboxesField field={field("checkboxes")} />
			</Wrapper>,
		);
		expect(
			screen.getAllByRole("checkbox").map((c) => (c as HTMLInputElement).value),
		).toEqual(["12", "1", "2", "later"]);
	});

	it("select", () => {
		render(
			<Wrapper>
				<SelectField field={field("select")} />
			</Wrapper>,
		);
		fireEvent.keyDown(screen.getByLabelText(/Month/), { key: "ArrowDown" });
		expect(inDocumentOrder(LABELS)).toEqual(LABELS);
	});
});
