// src/renderer/fields/__tests__/no-value-source.test.tsx
//
// ADR-0027, amended (by value, #356): a type whose value needs an Adapter is
// hidden from the type picker without it — but a Field of that type that is
// already stored stays shown and readable. Its control says the application
// has no source for it, offers no input, and shows what is stored.
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import type { FieldKitAdapters } from "../../adapters";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";

function field(
	field_type: string,
	name: string,
	api_accessor: string,
	settings: Record<string, unknown> | null,
): Field {
	return {
		field_type,
		config: { name, api_accessor, required: false, instructions: "" },
		settings,
		children: null,
		system: false,
	};
}

function renderStored(
	stored: Field,
	value: unknown,
	adapters: FieldKitAdapters = {},
) {
	function Harness() {
		const methods = useForm({
			defaultValues: { [stored.config.api_accessor]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={builtInFieldTypes} adapters={adapters}>
					<FormProvider {...methods}>
						<FieldComponent field={stored} />
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}
	return render(<Harness />);
}

const CASES: {
	type: string;
	stored: Field;
	value: unknown;
	/** What the stored value reads as with no Adapter to name it. */
	reads: string;
	note: RegExp;
}[] = [
	{
		type: "reference",
		stored: field("reference", "Related", "related", {
			blueprints: [{ blueprint: "bp_article" }],
			pin_mode: "none",
		}),
		value: [{ _id: "r1", id: "article-1" }],
		reads: "article-1",
		note: /Reference adapter not configured/,
	},
	{
		type: "single_reference",
		stored: field("single_reference", "Author", "author", {
			blueprints: [{ blueprint: "bp_person" }],
			pin_mode: "none",
		}),
		value: { _id: "r1", id: "person-7" },
		reads: "person-7",
		note: /Reference adapter not configured/,
	},
	{
		type: "media",
		stored: field("media", "Images", "images", {}),
		value: ["asset-1", "asset-2"],
		// The media cell without `resolve` counts — what read mode shows.
		reads: "2 files",
		note: /Media adapter not configured/,
	},
	{
		type: "lookup",
		stored: field("lookup", "Stylesheet", "stylesheet", {
			source: "layout:stylesheet",
		}),
		value: "sheet-1",
		reads: "sheet-1",
		note: /Lookup source "layout:stylesheet" is not registered/,
	},
];

describe.each(CASES)("a stored $type Field with no source", ({
	stored,
	value,
	reads,
	note,
}) => {
	const accessor = stored.config.api_accessor;

	it("says there is no source and offers no input", () => {
		renderStored(stored, value);

		expect(screen.getByText(stored.config.name)).toBeInTheDocument();
		expect(screen.getByTestId(`${accessor}-no-source`)).toHaveTextContent(note);
		expect(screen.queryByRole("combobox")).toBeNull();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("button", { name: /add|upload/i })).toBeNull();
	});

	it("still shows what is stored", async () => {
		renderStored(stored, value);

		expect(await screen.findByText(reads)).toBeInTheDocument();
	});

	it("shows no stored value when there is none", () => {
		renderStored(stored, null);

		expect(screen.getByTestId(`${accessor}-no-source`)).toBeInTheDocument();
		expect(screen.queryByText(reads)).toBeNull();
	});
});

describe("lookup with Sources registered, but not the one it names", () => {
	it("is a no-source control too, showing the stored id", async () => {
		const stored = CASES[3].stored;
		renderStored(stored, "sheet-1", {
			lookup: {
				"print:printer": {
					search: async () => ({ items: [], total: 0 }),
				},
			},
		});
		expect(screen.getByTestId("stylesheet-no-source")).toHaveTextContent(
			/not registered/,
		);
		expect(await screen.findByText("sheet-1")).toBeInTheDocument();
	});
});
