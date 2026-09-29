import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { RichTextField } from "../rich-text-field";

// Without `@knkcs/fieldkit/rich-text`, a rich_text Field is shown read-only
// (ADR-0026): the JSON textarea it replaced let anyone write a document
// knkeditor refuses.

const body = {
	type: "doc",
	content: [
		{
			type: "textWrapper",
			attrs: { id: "a", textAlign: null, attributes: {} },
			content: [{ type: "text", text: "Eins." }],
		},
	],
};

const field: Field = {
	field_type: "rich_text",
	config: {
		name: "Body",
		api_accessor: "body",
		required: false,
		instructions: "The article",
	},
	settings: { text_type: "article@3" },
	children: null,
	system: false,
};

function renderField(
	defaultValues: Record<string, unknown>,
): () => UseFormReturn {
	let methods: UseFormReturn | undefined;
	function Wrapper({ children }: { children: ReactNode }) {
		methods = useForm({ defaultValues });
		return (
			<ChakraProvider value={defaultSystem}>
				<FormProvider {...methods}>{children}</FormProvider>
			</ChakraProvider>
		);
	}
	render(
		<Wrapper>
			<RichTextField field={field} />
		</Wrapper>,
	);
	return () => methods as UseFormReturn;
}

describe("RichTextField (the core renderer's fallback)", () => {
	it("shows the document's text read-only, with no control to edit it", () => {
		const form = renderField({ body });
		expect(screen.getByText("Body")).toBeInTheDocument();
		expect(screen.getByText("Eins.")).toBeInTheDocument();
		expect(screen.getByText(/can't be edited here/)).toBeInTheDocument();
		expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		// The document is kept as it came, its nulls and empty objects too.
		expect(form().getValues("body")).toStrictEqual(body);
	});

	it("shows a dash for no document", () => {
		renderField({});
		expect(screen.getByTestId("rich-text-fallback-body")).toHaveTextContent(
			"—",
		);
	});
});
