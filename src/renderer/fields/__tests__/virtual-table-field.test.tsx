import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import { numberPlugin } from "../../../schema/field-types/number";
import { textPlugin } from "../../../schema/field-types/text";
import type { VirtualTableSettings } from "../../../schema/field-types/virtual-table";
import { virtualTablePlugin } from "../../../schema/field-types/virtual-table";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import type { FieldKitAdapters } from "../../adapters";
import { FieldKitProvider } from "../../provider";
import { VirtualTableField } from "../virtual-table-field";

const ACCESSOR = "line_items";

function rowField(
	fieldType: string,
	name: string,
	accessor: string,
	required = false,
): Field {
	return {
		field_type: fieldType,
		config: { name, api_accessor: accessor, required, instructions: "" },
		settings: null,
		children: null,
		system: false,
	};
}

/** A neutral line-items Row Spec: what a row of an order table holds. */
const ROW_SPEC: Field[] = [
	rowField("text", "Description", "description"),
	rowField("number", "Quantity", "quantity"),
];

/** The same Row Spec with a column an Author must fill in. */
const REQUIRED_ROW_SPEC: Field[] = [
	rowField("text", "Description", "description", true),
	rowField("number", "Quantity", "quantity"),
];

function lineItems(
	settings: VirtualTableSettings | null,
	children: Field[] | null,
): Field<VirtualTableSettings> {
	return {
		field_type: "virtual_table",
		config: {
			name: "Line items",
			api_accessor: ACCESSOR,
			required: false,
			instructions: "",
		},
		settings,
		children,
		system: false,
	};
}

function blueprintAdapter(fields: Field[] = ROW_SPEC) {
	return {
		getSchema: vi.fn().mockResolvedValue(fields),
		getData: vi
			.fn()
			.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 }),
	};
}

function Wrapper({
	children,
	adapters = {},
	defaultValues = {},
}: {
	children: ReactNode;
	adapters?: FieldKitAdapters;
	defaultValues?: Record<string, unknown>;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider
				plugins={[textPlugin, numberPlugin, virtualTablePlugin]}
				adapters={adapters}
			>
				<FormProvider {...methods}>{children}</FormProvider>
			</FieldKitProvider>
		</ChakraProvider>
	);
}

/** Reads the stored array straight from the form, so what the table promised
 * can be checked against what was actually written. */
function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

/**
 * The Field in a real form: every built-in plugin, the Row Spec's own Zod
 * Schema as the resolver, and a submit button — the setup an error has to come
 * through, since a row's message is the Consumer's own parse.
 */
function renderEditor({
	field,
	rows = [],
	readOnly = false,
	adapters = {},
}: {
	field: Field<VirtualTableSettings>;
	rows?: Record<string, unknown>[];
	readOnly?: boolean;
	adapters?: FieldKitAdapters;
}) {
	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([field], builtInFieldTypes)),
			defaultValues: { [ACCESSOR]: rows },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={builtInFieldTypes} adapters={adapters}>
					<FormProvider {...methods}>
						<form onSubmit={methods.handleSubmit(() => undefined)} noValidate>
							<VirtualTableField field={field} readOnly={readOnly} />
							<button type="submit">Submit</button>
						</form>
						<StoredValue />
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}
	return render(<Harness />);
}

describe("VirtualTableField — its columns", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("draws its columns from an embedded Row Spec, fetching nothing", () => {
		const adapter = blueprintAdapter();
		render(
			<Wrapper
				adapters={{ blueprint: adapter }}
				defaultValues={{
					line_items: [{ description: "Binding", quantity: 3 }],
				}}
			>
				<VirtualTableField field={lineItems({}, ROW_SPEC)} />
			</Wrapper>,
		);

		expect(screen.getByText("Description")).toBeInTheDocument();
		expect(screen.getByText("Quantity")).toBeInTheDocument();
		expect(screen.getByText("Binding")).toBeInTheDocument();
		expect(adapter.getSchema).not.toHaveBeenCalled();
	});

	it("draws its columns from a linked Row Spec `resolveSpec()` already resolved", () => {
		// The resolved shape: a Blueprint named AND its Fields in `children`.
		// The renderer reads the children and asks the adapter for nothing.
		const adapter = blueprintAdapter();
		render(
			<Wrapper
				adapters={{ blueprint: adapter }}
				defaultValues={{ line_items: [] }}
			>
				<VirtualTableField
					field={lineItems({ blueprint: "line_item_bp" }, ROW_SPEC)}
				/>
			</Wrapper>,
		);

		expect(screen.getByText("Description")).toBeInTheDocument();
		expect(adapter.getSchema).not.toHaveBeenCalled();
	});

	it("self-resolves a linked Row Spec for display when the Consumer skipped resolveSpec()", async () => {
		const adapter = blueprintAdapter();
		render(
			<Wrapper
				adapters={{ blueprint: adapter }}
				defaultValues={{ line_items: [] }}
			>
				<VirtualTableField
					field={lineItems({ blueprint: "line_item_bp" }, null)}
				/>
			</Wrapper>,
		);

		expect(await screen.findByText("Description")).toBeInTheDocument();
		expect(adapter.getSchema).toHaveBeenCalledWith("line_item_bp");
	});

	it("renders an embedded Row Spec with no blueprint adapter configured", () => {
		// The whole point of the embedded half: a Consumer without Blueprints
		// still gets a working table (ADR-0017).
		render(
			<Wrapper defaultValues={{ line_items: [{ description: "Cover" }] }}>
				<VirtualTableField field={lineItems({}, ROW_SPEC)} />
			</Wrapper>,
		);

		expect(screen.getByText("Description")).toBeInTheDocument();
		expect(
			screen.queryByText("Blueprint adapter not configured"),
		).not.toBeInTheDocument();
	});

	it("says so when a linked Row Spec has no adapter to resolve it", () => {
		render(
			<Wrapper defaultValues={{ line_items: [] }}>
				<VirtualTableField
					field={lineItems({ blueprint: "line_item_bp" }, null)}
				/>
			</Wrapper>,
		);

		expect(
			screen.getByText("Blueprint adapter not configured"),
		).toBeInTheDocument();
	});

	it("leaves a hidden Row Spec column out of the table", () => {
		const hidden: Field = {
			...rowField("text", "Internal note", "internal_note"),
			config: {
				name: "Internal note",
				api_accessor: "internal_note",
				required: false,
				instructions: "",
				hidden: true,
			},
		};
		renderEditor({ field: lineItems({}, [...ROW_SPEC, hidden]) });

		expect(screen.getByText("Description")).toBeInTheDocument();
		expect(screen.queryByText("Internal note")).not.toBeInTheDocument();
	});

	it("shows a row through each column's own cell component", () => {
		renderEditor({
			field: lineItems({}, [
				...ROW_SPEC,
				rowField("boolean", "Taxed", "taxed"),
			]),
			rows: [{ description: "Binding", quantity: 3, taxed: true }],
		});

		// The boolean cell says "Yes"; a stringified value would say "true".
		expect(screen.getByText("Yes")).toBeInTheDocument();
	});
});

describe("VirtualTableField — a Blueprint the Author clears", () => {
	it("drops the previous Blueprint's columns rather than leaving them on screen", async () => {
		const adapter = blueprintAdapter();
		const { rerender } = render(
			<Wrapper
				adapters={{ blueprint: adapter }}
				defaultValues={{ line_items: [] }}
			>
				<VirtualTableField
					field={lineItems({ blueprint: "line_item_bp" }, null)}
				/>
			</Wrapper>,
		);

		expect(await screen.findByText("Description")).toBeInTheDocument();

		rerender(
			<Wrapper
				adapters={{ blueprint: adapter }}
				defaultValues={{ line_items: [] }}
			>
				<VirtualTableField field={lineItems({}, null)} />
			</Wrapper>,
		);

		expect(screen.queryByText("Description")).not.toBeInTheDocument();
	});
});

describe("VirtualTableField — adding a row", () => {
	it("writes the drawer's row into the Field's array", async () => {
		const user = userEvent.setup();
		renderEditor({ field: lineItems({}, ROW_SPEC) });

		await user.click(screen.getByRole("button", { name: "Add row" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		await user.type(within(drawer).getByLabelText(/Description/), "Binding");
		// The number control is a spinbutton; its label is not `for`-linked.
		await user.type(within(drawer).getByRole("spinbutton"), "3");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(stored()).toEqual([{ description: "Binding", quantity: 3 }]);
		});
		expect(await screen.findByText("Binding")).toBeInTheDocument();
	});

	it("writes nothing when the drawer is cancelled", async () => {
		const user = userEvent.setup();
		renderEditor({ field: lineItems({}, ROW_SPEC) });

		await user.click(screen.getByRole("button", { name: "Add row" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		await user.type(within(drawer).getByLabelText(/Description/), "Binding");
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => {
			expect(
				screen.queryByTestId("virtual-table-row-drawer"),
			).not.toBeInTheDocument();
		});
		expect(stored()).toEqual([]);
	});

	it("follows the new row to the page it landed on", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({ max_records_per_page: 2 }, ROW_SPEC),
			rows: [
				{ description: "One", quantity: 1 },
				{ description: "Two", quantity: 2 },
			],
		});

		await user.click(screen.getByRole("button", { name: "Add row" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		await user.type(within(drawer).getByLabelText(/Description/), "Three");
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Page two, where the third row of a two-row page landed.
		expect(await screen.findByText("Three")).toBeInTheDocument();
		expect(screen.queryByText("One")).not.toBeInTheDocument();
	});

	it("stops offering Add row once max_items rows are stored", () => {
		renderEditor({
			field: lineItems({ max_items: 1 }, ROW_SPEC),
			rows: [{ description: "Binding", quantity: 1 }],
		});

		expect(
			screen.queryByRole("button", { name: "Add row" }),
		).not.toBeInTheDocument();
	});
});

describe("VirtualTableField — a linked Row Spec", () => {
	it("edits through a linked Row Spec the adapter resolved", async () => {
		// The stub stands in for `resolveSpec()`: the Field names a Blueprint
		// and carries no children, so the columns — and the drawer's fields —
		// are the ones the adapter handed back.
		const user = userEvent.setup();
		const adapter = blueprintAdapter();
		renderEditor({
			field: lineItems({ blueprint: "line_item_bp" }, null),
			adapters: { blueprint: adapter },
		});

		await user.click(await screen.findByRole("button", { name: "Add row" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		await user.type(within(drawer).getByLabelText(/Description/), "Binding");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(stored()).toEqual([{ description: "Binding", quantity: 0 }]);
		});
	});
});

describe("VirtualTableField — editing a row", () => {
	it("replaces the row it was opened on, leaving the others alone", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({}, ROW_SPEC),
			rows: [
				{ description: "Binding", quantity: 1 },
				{ description: "Cover", quantity: 2 },
			],
		});

		await user.click(screen.getByRole("button", { name: "Edit row 2" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		const description = within(drawer).getByLabelText(/Description/);
		await user.clear(description);
		await user.type(description, "Hardcover");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(stored()).toEqual([
				{ description: "Binding", quantity: 1 },
				{ description: "Hardcover", quantity: 2 },
			]);
		});
	});

	it("keeps the keys a row carries that no column edits", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({}, ROW_SPEC),
			rows: [{ id: "row-7", description: "Binding", quantity: 1 }],
		});

		await user.click(screen.getByRole("button", { name: "Edit row 1" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		const description = within(drawer).getByLabelText(/Description/);
		await user.clear(description);
		await user.type(description, "Cover");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(stored()).toEqual([
				{ id: "row-7", description: "Cover", quantity: 1 },
			]);
		});
	});

	it("discards an edit that is cancelled", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({}, ROW_SPEC),
			rows: [{ description: "Binding", quantity: 1 }],
		});

		await user.click(screen.getByRole("button", { name: "Edit row 1" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		const description = within(drawer).getByLabelText(/Description/);
		await user.clear(description);
		await user.type(description, "Hardcover");
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => {
			expect(
				screen.queryByTestId("virtual-table-row-drawer"),
			).not.toBeInTheDocument();
		});
		expect(stored()).toEqual([{ description: "Binding", quantity: 1 }]);
	});
});

describe("VirtualTableField — deleting a row", () => {
	it("removes the row from the array", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({}, ROW_SPEC),
			rows: [
				{ description: "Binding", quantity: 1 },
				{ description: "Cover", quantity: 2 },
			],
		});

		await user.click(screen.getByRole("button", { name: "Delete row 1" }));

		await waitFor(() => {
			expect(stored()).toEqual([{ description: "Cover", quantity: 2 }]);
		});
	});

	it("stops offering delete once min_items rows are left", () => {
		renderEditor({
			field: lineItems({ min_items: 1 }, ROW_SPEC),
			rows: [{ description: "Binding", quantity: 1 }],
		});

		expect(
			screen.queryByRole("button", { name: "Delete row 1" }),
		).not.toBeInTheDocument();
	});
});

describe("VirtualTableField — paging", () => {
	const rows = [
		{ description: "One", quantity: 1 },
		{ description: "Two", quantity: 2 },
		{ description: "Three", quantity: 3 },
	];

	it("shows one page of max_records_per_page rows at a time", () => {
		renderEditor({
			field: lineItems({ max_records_per_page: 2 }, ROW_SPEC),
			rows,
		});

		expect(screen.getByText("One")).toBeInTheDocument();
		expect(screen.getByText("Two")).toBeInTheDocument();
		expect(screen.queryByText("Three")).not.toBeInTheDocument();
	});

	it("pages over the array it already holds", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({ max_records_per_page: 2 }, ROW_SPEC),
			rows,
		});

		await user.click(screen.getByRole("button", { name: "Next page" }));

		expect(await screen.findByText("Three")).toBeInTheDocument();
		expect(screen.queryByText("One")).not.toBeInTheDocument();
	});

	it("edits the row the second page is showing, not the first page's", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({ max_records_per_page: 2 }, ROW_SPEC),
			rows,
		});

		await user.click(screen.getByRole("button", { name: "Next page" }));
		// Row three of the array, however many pages in front of it.
		await user.click(await screen.findByRole("button", { name: "Edit row 3" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		const description = within(drawer).getByLabelText(/Description/);
		await user.clear(description);
		await user.type(description, "Third");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(stored()).toEqual([
				{ description: "One", quantity: 1 },
				{ description: "Two", quantity: 2 },
				{ description: "Third", quantity: 3 },
			]);
		});
	});

	it("falls back to the last page when the page it was on is emptied", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({ max_records_per_page: 2 }, ROW_SPEC),
			rows,
		});

		await user.click(screen.getByRole("button", { name: "Next page" }));
		await user.click(
			await screen.findByRole("button", { name: "Delete row 3" }),
		);

		expect(await screen.findByText("One")).toBeInTheDocument();
	});
});

describe("VirtualTableField — read only", () => {
	it("offers no add, no edit and no delete", () => {
		renderEditor({
			field: lineItems({}, ROW_SPEC),
			rows: [{ description: "Binding", quantity: 1 }],
			readOnly: true,
		});

		expect(screen.getByText("Binding")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Add row" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Edit row 1" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Delete row 1" }),
		).not.toBeInTheDocument();
	});
});

describe("VirtualTableField — an invalid row", () => {
	it("shows the message on the row, and again on the column in the drawer", async () => {
		const user = userEvent.setup();
		renderEditor({
			field: lineItems({}, REQUIRED_ROW_SPEC),
			rows: [
				{ description: "Binding", quantity: 1 },
				{ description: "", quantity: 2 },
			],
		});

		// The Consumer's own parse is what produces the message.
		await user.click(screen.getByRole("button", { name: "Submit" }));

		const rowError = await screen.findByTestId("virtual-table-row-error");
		expect(rowError).toHaveTextContent(/Description/);

		await user.click(screen.getByRole("button", { name: "Edit row 2" }));
		const drawer = await screen.findByTestId("virtual-table-row-drawer");
		expect(
			await within(drawer).findByText(
				rowError.textContent?.split(": ")[1] ?? "",
			),
		).toBeInTheDocument();
	});

	it("says nothing about a row on a form nobody has submitted yet", () => {
		renderEditor({
			field: lineItems({}, REQUIRED_ROW_SPEC),
			rows: [{ description: "", quantity: 2 }],
		});

		expect(
			screen.queryByTestId("virtual-table-row-error"),
		).not.toBeInTheDocument();
	});
});
