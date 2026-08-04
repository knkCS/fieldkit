import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { ReferenceSettings } from "../../../schema/field-types/reference";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeReferenceAdapter,
	type FakeReferenceAdapter,
	fakeCatalogue,
} from "../../../test/fake-reference-adapter";
import type { FieldKitAdapters } from "../../adapters";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";

const ACCESSOR = "related";
const LABEL = "Related articles";

function makeField(
	overrides: { required?: boolean; settings?: ReferenceSettings | null } = {},
): Field<ReferenceSettings> {
	return {
		field_type: "reference",
		config: {
			name: LABEL,
			api_accessor: ACCESSOR,
			required: overrides.required ?? false,
			instructions: "",
		},
		settings:
			overrides.settings === undefined
				? { blueprints: ["article"] }
				: overrides.settings,
		children: null,
		system: false,
	};
}

/** Reads the stored value straight from the form, so an assertion about what
 * was stored never goes through the same DOM the control renders. */
function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderField({
	field = makeField(),
	value = [],
	adapter,
	adapters,
	readOnly = false,
	onError,
}: {
	field?: Field<ReferenceSettings>;
	value?: unknown;
	adapter?: FakeReferenceAdapter;
	adapters?: FieldKitAdapters;
	readOnly?: boolean;
	onError?: (error: Error, fieldId: string) => void;
} = {}) {
	const submitted = vi.fn();
	const resolvedAdapter = adapter ?? createFakeReferenceAdapter();
	const resolved = adapters ?? ({ reference: resolvedAdapter } as const);

	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([field], builtInFieldTypes)),
			defaultValues: { [ACCESSOR]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider
					plugins={builtInFieldTypes}
					adapters={resolved}
					onError={onError}
				>
					<FormProvider {...methods}>
						{/* `noValidate`, as every Consumer's form must be — see
						    docs/react-hook-form-reference.md. */}
						<form
							noValidate
							onSubmit={methods.handleSubmit((data) => submitted(data))}
						>
							<FieldComponent field={field} readOnly={readOnly} />
							<StoredValue />
							<button type="submit">Save</button>
						</form>
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}

	const view = render(<Harness />);
	return { ...view, submitted, adapter: resolvedAdapter };
}

function addButton() {
	return screen.getByRole("button", { name: "Add reference" });
}

/** Opens the browse drawer the way a person does, and waits for the first
 * page of Contents to arrive. */
async function openPicker(user: ReturnType<typeof userEvent.setup>) {
	await user.click(addButton());
	return await screen.findByTestId("reference-picker");
}

/**
 * The column headings the results table shows.
 *
 * Read off the header cells rather than through `getByRole("columnheader")`:
 * anker's DataTable puts `role="button"` on every sortable header, which
 * masks the implicit role. The headings are still what a person reads.
 */
function resultColumns(): string[] {
	const table = screen.getByTestId("spec-data-table");
	return Array.from(table.querySelectorAll("th")).map(
		(header) => header.textContent?.trim() ?? "",
	);
}

describe("ReferenceField", () => {
	describe("the list", () => {
		it("shows each stored Reference under its Content's resolved name", async () => {
			renderField({ value: [{ id: "article-1" }, { id: "article-2" }] });

			expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
			expect(screen.getByText("Dogs of the world")).toBeInTheDocument();
		});

		it("keeps the stored order", async () => {
			renderField({ value: [{ id: "article-2" }, { id: "article-1" }] });

			await screen.findByText("Cats of the world");
			const rows = screen.getAllByTestId("reference-row");
			expect(rows.map((row) => row.textContent)).toEqual([
				expect.stringContaining("Dogs of the world"),
				expect.stringContaining("Cats of the world"),
			]);
		});

		it("shows a Content renamed elsewhere under its new name", async () => {
			const adapter = createFakeReferenceAdapter();
			adapter.rename("article-2", "Dogs of the whole world");

			renderField({ value: [{ id: "article-2" }], adapter });

			expect(
				await screen.findByText("Dogs of the whole world"),
			).toBeInTheDocument();
		});

		it("still shows a Reference it cannot resolve, under its id", async () => {
			renderField({ value: [{ id: "deleted-42" }] });

			expect(await screen.findByText("deleted-42")).toBeInTheDocument();
			// And the value is left exactly as it was — an unresolvable Content
			// is not silently dropped from the form data.
			expect(stored()).toEqual([{ id: "deleted-42" }]);
		});

		it("removes the Reference whose row's remove action was used", async () => {
			const user = userEvent.setup();
			renderField({ value: [{ id: "article-1" }, { id: "article-2" }] });

			await user.click(
				await screen.findByRole("button", { name: "Remove Cats of the world" }),
			);

			expect(stored()).toEqual([{ id: "article-2" }]);
			expect(screen.queryByText("Cats of the world")).not.toBeInTheDocument();
		});

		it("removes the right Reference even when the stored list holds a malformed entry", async () => {
			const user = userEvent.setup();
			// Form data is only as well-formed as whatever produced it. The bad
			// entry renders no row, so the rows and the stored positions no
			// longer line up — and a remove must still hit what was clicked.
			renderField({
				value: ["loose-id", { id: "article-1" }, { id: "article-2" }],
			});

			await user.click(
				await screen.findByRole("button", { name: "Remove Cats of the world" }),
			);

			expect(stored()).toEqual(["loose-id", { id: "article-2" }]);
		});

		it("says so when there are no References yet", () => {
			renderField();

			expect(screen.getByText("No references yet.")).toBeInTheDocument();
		});

		it("says so when no reference adapter is configured", () => {
			renderField({ adapters: {} });

			expect(
				screen.getByText("Reference adapter not configured"),
			).toBeInTheDocument();
		});

		it("cannot be added to or removed from in read-only mode", async () => {
			renderField({ value: [{ id: "article-1" }], readOnly: true });

			expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: /Remove/ }),
			).not.toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Add reference" }),
			).not.toBeInTheDocument();
		});

		it("stops offering to add at max_items", async () => {
			renderField({
				field: makeField({
					settings: { blueprints: ["article"], max_items: 1 },
				}),
				value: [{ id: "article-1" }],
			});

			await screen.findByText("Cats of the world");
			expect(addButton()).toBeDisabled();
		});
	});

	describe("the browse drawer", () => {
		it("does not touch the Adapter's catalogue until someone opens it", async () => {
			const user = userEvent.setup();
			const { adapter } = renderField({ value: [{ id: "article-1" }] });

			// A form can hold many Reference Fields. Resolving the names it
			// already shows is one thing; browsing a catalogue nobody has asked
			// to see is another.
			await screen.findByText("Cats of the world");
			expect(adapter.searches).toHaveLength(0);

			await openPicker(user);

			await waitFor(() => expect(adapter.searches.length).toBeGreaterThan(0));
		});

		it("starts each open on a fresh browse", async () => {
			const user = userEvent.setup();
			const { adapter } = renderField();

			const picker = await openPicker(user);
			await user.type(
				within(picker).getByRole("textbox", { name: "Search content" }),
				"cat",
			);
			await waitFor(() => expect(adapter.searches.at(-1)?.query).toBe("cat"));
			await user.click(screen.getByRole("button", { name: "Cancel" }));

			await openPicker(user);

			// The search box comes back empty, so what is sent must too.
			await waitFor(() => expect(adapter.searches.at(-1)?.query).toBe(""));
			expect(await screen.findByText("Dogs of the world")).toBeInTheDocument();
		});

		it("lists the Contents the Adapter offers, with a search box", async () => {
			const user = userEvent.setup();
			renderField();

			const picker = await openPicker(user);

			expect(
				within(picker).getByRole("textbox", { name: "Search content" }),
			).toBeInTheDocument();
			expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
			expect(screen.getByText("Dogs of the world")).toBeInTheDocument();
		});

		it("offers only Contents matching the Field's Blueprints", async () => {
			const user = userEvent.setup();
			renderField();

			await openPicker(user);

			expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
			expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
		});

		it("adds the picked Content to the list, storing only its id", async () => {
			const user = userEvent.setup();
			renderField();

			await openPicker(user);
			await user.click(await screen.findByText("Dogs of the world"));

			expect(stored()).toEqual([{ id: "article-2" }]);
			await waitFor(() =>
				expect(
					screen.queryByTestId("reference-picker"),
				).not.toBeInTheDocument(),
			);
		});

		it("appends rather than replacing, so the list keeps what it had", async () => {
			const user = userEvent.setup();
			renderField({ value: [{ id: "article-1" }] });

			await openPicker(user);
			await user.click(await screen.findByText("Dogs of the world"));

			expect(stored()).toEqual([{ id: "article-1" }, { id: "article-2" }]);
		});

		it("narrows the browse to what was searched", async () => {
			const user = userEvent.setup();
			renderField();

			const picker = await openPicker(user);
			await screen.findByText("Dogs of the world");
			await user.type(
				within(picker).getByRole("textbox", { name: "Search content" }),
				"cat",
			);

			await waitFor(() =>
				expect(screen.queryByText("Dogs of the world")).not.toBeInTheDocument(),
			);
			expect(screen.getByText("Cats of the world")).toBeInTheDocument();
			expect(screen.getByText("Catalogues explained")).toBeInTheDocument();
		});

		it("reports a failed search through onError, leaving the drawer usable", async () => {
			const user = userEvent.setup();
			const onError = vi.fn();
			const adapter = createFakeReferenceAdapter({
				failSearch: new Error("search exploded"),
			});
			renderField({ adapter, onError });

			const picker = await openPicker(user);

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
			);
			expect(
				within(picker).getByRole("textbox", { name: "Search content" }),
			).toBeInTheDocument();
		});
	});

	describe("the Adapter's own Specs", () => {
		it("renders the filter Spec as a form", async () => {
			const user = userEvent.setup();
			renderField();

			const picker = await openPicker(user);

			expect(
				within(picker).getByTestId("reference-picker-filters"),
			).toBeInTheDocument();
			expect(within(picker).getByLabelText(/Status/)).toBeInTheDocument();
		});

		it("renders the result Spec as the table's columns", async () => {
			const user = userEvent.setup();
			renderField();

			await openPicker(user);

			await screen.findByText("Cats of the world");
			expect(resultColumns()).toEqual(["Name", "Status"]);
			// And the Consumer's own value shows in its own column.
			expect(screen.getAllByText("published").length).toBeGreaterThan(0);
		});

		it("hands filter values back as a record it never inspected", async () => {
			const user = userEvent.setup();
			const { adapter } = renderField();

			const picker = await openPicker(user);
			await user.selectOptions(
				within(picker).getByLabelText(/Status/),
				"published",
			);

			await waitFor(() =>
				expect(adapter.searches.at(-1)?.filters).toEqual({
					status: "published",
				}),
			);
			// The Adapter's own key, its own value — nothing renamed, nothing
			// dropped, nothing added.
			await waitFor(() =>
				expect(screen.queryByText("Dogs of the world")).not.toBeInTheDocument(),
			);
			expect(screen.getByText("Cats of the world")).toBeInTheDocument();
		});

		it("degrades to a search box and a name column when the Adapter describes neither", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter({
				searchFilters: null,
				resultColumns: null,
			});
			renderField({ adapter });

			const picker = await openPicker(user);

			expect(
				within(picker).getByRole("textbox", { name: "Search content" }),
			).toBeInTheDocument();
			expect(
				within(picker).queryByTestId("reference-picker-filters"),
			).not.toBeInTheDocument();
			expect(resultColumns()).toEqual(["Name"]);
			// Still fully usable: a Content can be picked from the degraded table.
			await user.click(await screen.findByText("Cats of the world"));
			expect(stored()).toEqual([{ id: "article-1" }]);
		});
	});

	describe("paging through the catalogue", () => {
		it("shows the total the Adapter reports, not the page's length", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter({
				contents: fakeCatalogue(25),
			});
			renderField({ adapter });

			await openPicker(user);

			expect(await screen.findByText("25 contents")).toBeInTheDocument();
			expect(screen.getByText("Content 10")).toBeInTheDocument();
			expect(screen.queryByText("Content 11")).not.toBeInTheDocument();
		});

		it("asks the Adapter for the next page and shows it", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter({
				contents: fakeCatalogue(25),
			});
			renderField({ adapter });

			await openPicker(user);
			await screen.findByText("Content 1");
			await user.click(screen.getByRole("button", { name: "Next page" }));

			expect(await screen.findByText("Content 11")).toBeInTheDocument();
			expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
			expect(adapter.searches.at(-1)?.page).toBe(2);
		});

		it("goes back to page one when the browse is narrowed", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter({
				contents: fakeCatalogue(25),
			});
			renderField({ adapter });

			const picker = await openPicker(user);
			await screen.findByText("Content 1");
			await user.click(screen.getByRole("button", { name: "Next page" }));
			await screen.findByText("Content 11");

			await user.type(
				within(picker).getByRole("textbox", { name: "Search content" }),
				"Content 2",
			);

			await waitFor(() => expect(adapter.searches.at(-1)?.page).toBe(1));
			expect(await screen.findByText("Content 2")).toBeInTheDocument();
		});
	});

	describe("what the Schema enforces", () => {
		it("blocks submit and reports at its own path when required and empty", async () => {
			const user = userEvent.setup();
			const { submitted } = renderField({
				field: makeField({ required: true }),
			});

			await user.click(screen.getByRole("button", { name: "Save" }));

			expect(
				await screen.findByText(`${LABEL} is required`),
			).toBeInTheDocument();
			expect(submitted).not.toHaveBeenCalled();
		});

		it("submits once a required Field has a Reference", async () => {
			const user = userEvent.setup();
			const { submitted } = renderField({
				field: makeField({ required: true }),
			});

			await openPicker(user);
			await user.click(await screen.findByText("Cats of the world"));
			await user.click(screen.getByRole("button", { name: "Save" }));

			await waitFor(() =>
				expect(submitted).toHaveBeenCalledWith({
					[ACCESSOR]: [{ id: "article-1" }],
				}),
			);
		});
	});
});
