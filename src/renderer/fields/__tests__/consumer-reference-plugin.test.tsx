// src/renderer/fields/__tests__/consumer-reference-plugin.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpen } from "lucide-react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import {
	createReferencePlugin,
	type ReferenceSettings,
} from "../../../schema/field-types/reference";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import { createFakeReferenceAdapter } from "../../../test/fake-reference-adapter";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";

/**
 * `toc_reference`, minted by the Consumer that gives it meaning (ADR-0010).
 *
 * The point of every test below is that nothing here is special-cased: a type
 * fieldkit has never heard of renders, validates and stores exactly as the
 * built-in `reference` does, because it *is* the built-in `reference` with a
 * different id and a cap. `reference-field.test.tsx` asserts the control's own
 * behaviour in depth; what is asserted here is only that a runtime-registered
 * id reaches it — the tree, the drawer and the Schema all resolving through
 * the plugin list rather than through a name fieldkit knows.
 */
const tocReferencePlugin = createReferencePlugin({
	id: "toc_reference",
	name: "TOC Reference",
	description: "The publication tree this Content hangs in",
	icon: BookOpen,
	maxPerSpec: 1,
	availableIn: ["blueprint"],
});

const PLUGINS = [...builtInFieldTypes, tocReferencePlugin];
const ACCESSOR = "toc";
const LABEL = "Table of contents";

function makeField(
	overrides: { required?: boolean } = {},
): Field<ReferenceSettings> {
	return {
		field_type: "toc_reference",
		config: {
			name: LABEL,
			api_accessor: ACCESSOR,
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: { blueprints: ["article"] },
		children: null,
		system: false,
	};
}

function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderField({
	field = makeField(),
	value = [] as unknown,
}: {
	field?: Field<ReferenceSettings>;
	value?: unknown;
} = {}) {
	const submitted = vi.fn();
	const adapter = createFakeReferenceAdapter();

	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([field], PLUGINS)),
			defaultValues: { [ACCESSOR]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={PLUGINS} adapters={{ reference: adapter }}>
					<FormProvider {...methods}>
						<form
							noValidate
							onSubmit={methods.handleSubmit((data) => submitted(data))}
						>
							<FieldComponent field={field} />
							<StoredValue />
							<button type="submit">Save</button>
						</form>
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}

	const view = render(<Harness />);
	return { ...view, submitted, adapter };
}

describe("a Consumer-registered reference-shaped plugin, in the renderer", () => {
	it("renders the tree, resolving each Content's name through the Adapter", async () => {
		renderField({
			value: [{ id: "article-1", children: [{ id: "article-2" }] }],
		});

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Dogs of the world")).toBeInTheDocument();
	});

	it("nests a stored branch under its parent", async () => {
		renderField({
			value: [{ id: "article-1", children: [{ id: "article-2" }] }],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-row");
		expect(rows.map((row) => row.getAttribute("data-depth"))).toEqual([
			"0",
			"1",
		]);
	});

	it("adds a Content through the browse drawer, storing only its id", async () => {
		const user = userEvent.setup();
		renderField();

		await user.click(screen.getByRole("button", { name: "Add reference" }));
		await screen.findByTestId("reference-picker");
		await user.click(await screen.findByText("Dogs of the world"));

		expect(stored()).toEqual([{ id: "article-2" }]);
	});

	it("blocks submit when required and empty, and submits the tree when filled", async () => {
		const user = userEvent.setup();
		const { submitted } = renderField({ field: makeField({ required: true }) });

		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByText(`${LABEL} is required`)).toBeInTheDocument();
		expect(submitted).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Add reference" }));
		await screen.findByTestId("reference-picker");
		await user.click(await screen.findByText("Cats of the world"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(submitted).toHaveBeenCalledWith({
			[ACCESSOR]: [{ id: "article-1" }],
		});
	});
});
