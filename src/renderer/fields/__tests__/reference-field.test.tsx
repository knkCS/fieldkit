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
	fakeReferenceTree,
} from "../../../test/fake-reference-adapter";
import type { FieldKitAdapters } from "../../adapters";
import { FieldComponent } from "../../field-component";
import { REFERENCE_NAME_BATCH_SIZE } from "../../hooks/batch-ids";
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
	});

	describe("resolving names at size", () => {
		/** Past the batch size *and* past the collapse threshold, so the tree
		 * opens with every child hidden and no one call could carry it. */
		const COUNT = REFERENCE_NAME_BATCH_SIZE * 2 + 10;

		it("resolves every Reference in the tree, in calls no bigger than the batch size", async () => {
			const adapter = createFakeReferenceAdapter({
				contents: fakeCatalogue(COUNT),
			});
			renderField({ value: fakeReferenceTree(COUNT), adapter });

			await screen.findByText("Content 1");

			// Every level, not the rows on screen: the tree opened collapsed, so
			// half of these ids belong to References nobody can see yet. Find is
			// built on their names being resolved anyway (ADR-0013).
			await waitFor(() => expect(adapter.fetches.flat()).toHaveLength(COUNT));
			expect(adapter.fetches.flat()).toContain("article-2");
			expect(adapter.fetches.length).toBeGreaterThan(1);
			for (const call of adapter.fetches) {
				expect(call.length).toBeLessThanOrEqual(REFERENCE_NAME_BATCH_SIZE);
			}
		});

		it("shows a name for a Reference nested inside a collapsed branch", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter({
				contents: fakeCatalogue(COUNT),
			});
			renderField({ value: fakeReferenceTree(COUNT), adapter });

			await screen.findByText("Content 1");
			// Nothing under a root is on screen until the fold opens.
			expect(screen.queryByText("Content 2")).not.toBeInTheDocument();

			await user.click(
				screen.getByRole("button", { name: "Expand Content 1" }),
			);

			// Its name was already resolved, so the row arrives named rather than
			// showing an id until something fetches it.
			expect(screen.getByText("Content 2")).toBeInTheDocument();
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

	describe("Contents already in the tree", () => {
		it("does not offer one the tree already holds", async () => {
			const user = userEvent.setup();
			renderField({ value: [{ id: "article-1" }] });

			const picker = await openPicker(user);

			await within(picker).findByText("Dogs of the world");
			// Scoped to the drawer: the row behind it names the same Content, and
			// that one is meant to be there.
			expect(
				within(picker).queryByText("Cats of the world"),
			).not.toBeInTheDocument();
		});

		it("counts a nested Reference as already referenced, not only the roots", async () => {
			const user = userEvent.setup();
			renderField({
				value: [{ id: "article-1", children: [{ id: "article-2" }] }],
			});

			const picker = await openPicker(user);

			await within(picker).findByText("Catalogues explained");
			expect(
				within(picker).queryByText("Dogs of the world"),
			).not.toBeInTheDocument();
		});

		it("tells the Adapter which Contents it already references", async () => {
			const user = userEvent.setup();
			const { adapter } = renderField({
				value: [{ id: "article-1", children: [{ id: "article-2" }] }],
			});

			await openPicker(user);

			await waitFor(() =>
				expect(adapter.searches.at(-1)?.excludeIds).toEqual([
					"article-1",
					"article-2",
				]),
			);
		});

		it("shows a total that counts only what an honouring Adapter returned", async () => {
			const user = userEvent.setup();
			renderField({ value: [{ id: "article-1" }] });

			const picker = await openPicker(user);

			// Three articles in the catalogue, one of them already referenced.
			await waitFor(() =>
				expect(
					within(picker).getByTestId("reference-picker-total"),
				).toHaveTextContent("2 contents"),
			);
		});

		it("keeps them out even when the Adapter ignores the field", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter({ ignoreExcludeIds: true });
			renderField({ value: [{ id: "article-1" }], adapter });

			const picker = await openPicker(user);

			await within(picker).findByText("Dogs of the world");
			expect(
				within(picker).queryByText("Cats of the world"),
			).not.toBeInTheDocument();
			// The price of the backstop, and the reason honouring the field is
			// worth an Adapter's while: the count is the Adapter's, so it still
			// counts the Content nobody can pick.
			expect(
				within(picker).getByTestId("reference-picker-total"),
			).toHaveTextContent("3 contents");
		});

		it("offers a Content again once its Reference is removed", async () => {
			const user = userEvent.setup();
			renderField({ value: [{ id: "article-1" }] });

			const picker = await openPicker(user);
			await within(picker).findByText("Dogs of the world");
			expect(
				within(picker).queryByText("Cats of the world"),
			).not.toBeInTheDocument();
			await user.click(screen.getByRole("button", { name: "Cancel" }));

			await user.click(
				await screen.findByRole("button", { name: "Remove Cats of the world" }),
			);
			const reopened = await openPicker(user);

			expect(
				await within(reopened).findByText("Cats of the world"),
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

	describe("pinning", () => {
		/** Picks a Content in step one and waits for the second step to arrive. */
		async function pickInStepOne(
			user: ReturnType<typeof userEvent.setup>,
			name: string,
		) {
			await user.click(await screen.findByText(name));
			return await screen.findByTestId("reference-picker-pin-step");
		}

		it("has exactly one step when the Field does not pin", async () => {
			const user = userEvent.setup();
			const { adapter } = renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "none" },
				}),
			});

			await openPicker(user);
			await user.click(await screen.findByText("Dogs of the world"));

			// Picked and stored in one move: no second step ever appeared, and
			// nothing asked the Adapter what this Content could be pinned to.
			expect(stored()).toEqual([{ id: "article-2" }]);
			expect(
				screen.queryByTestId("reference-picker-pin-step"),
			).not.toBeInTheDocument();
			expect(adapter.pinTargetQueries).toHaveLength(0);
		});

		it("treats a Spec written before pinning existed as not pinning", async () => {
			const user = userEvent.setup();
			renderField({ field: makeField({ settings: { blueprints: [] } }) });

			await openPicker(user);
			await user.click(await screen.findByText("Dogs of the world"));

			expect(stored()).toEqual([{ id: "article-2" }]);
		});

		it("gains a second step listing that Content's Pin targets", async () => {
			const user = userEvent.setup();
			renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "release" },
				}),
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");

			// The browse is gone, and nothing was stored on the way here.
			expect(screen.queryByTestId("reference-picker")).not.toBeInTheDocument();
			expect(stored()).toEqual([]);
			expect(
				await within(step).findByRole("button", { name: /Spring release/ }),
			).toBeInTheDocument();
			expect(
				within(step).getByRole("button", { name: /Launch/ }),
			).toBeInTheDocument();
		});

		it("offers the kind of target the Field's setting names, never the value's", async () => {
			const user = userEvent.setup();
			const { adapter } = renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "version" },
				}),
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");

			expect(
				await within(step).findByRole("button", { name: /Version 3/ }),
			).toBeInTheDocument();
			expect(
				within(step).queryByRole("button", { name: /Spring release/ }),
			).not.toBeInTheDocument();
			// Asked for the Content that was picked, in the Field's mode.
			expect(adapter.pinTargetQueries).toEqual([
				{ contentId: "article-2", mode: "version" },
			]);
		});

		it("stores the Reference with only the target's id", async () => {
			const user = userEvent.setup();
			renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "release" },
				}),
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");
			await user.click(
				await within(step).findByRole("button", { name: /Spring release/ }),
			);

			// The id and nothing else — not the label, not which kind of target
			// it is. Only the Field's `pin_mode` says that (ADR-0008).
			expect(stored()).toEqual([{ id: "article-2", pin: "article-2-r2" }]);
			await waitFor(() =>
				expect(
					screen.queryByTestId("reference-picker-pin-step"),
				).not.toBeInTheDocument(),
			);
		});

		it("stores no Pin at all when the newest Version is chosen", async () => {
			const user = userEvent.setup();
			renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "release" },
				}),
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");
			await user.click(
				within(step).getByRole("button", { name: /Newest version/ }),
			);

			// No `pin` key, which is what "resolves to the newest Version"
			// looks like in stored data.
			expect(stored()).toEqual([{ id: "article-2" }]);
		});

		it("goes back to the browse without storing anything", async () => {
			const user = userEvent.setup();
			const { adapter } = renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "release" },
				}),
			});

			const picker = await openPicker(user);
			await user.type(
				within(picker).getByRole("textbox", { name: "Search content" }),
				"dogs",
			);
			await waitFor(() => expect(adapter.searches.at(-1)?.query).toBe("dogs"));
			const step = await pickInStepOne(user, "Dogs of the world");
			await user.click(within(step).getByRole("button", { name: "Back" }));

			// Back to the browse, still narrowed to what was searched — and the
			// search box still shows it, so the two agree.
			const again = await screen.findByTestId("reference-picker");
			expect(
				within(again).getByRole("textbox", { name: "Search content" }),
			).toHaveValue("dogs");
			expect(stored()).toEqual([]);
		});

		it("still offers the newest Version when the target lookup fails", async () => {
			const user = userEvent.setup();
			const onError = vi.fn();
			const adapter = createFakeReferenceAdapter({
				failPinTargets: new Error("pin lookup exploded"),
			});
			renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "release" },
				}),
				adapter,
				onError,
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
			);
			await user.click(
				within(step).getByRole("button", { name: /Newest version/ }),
			);
			expect(stored()).toEqual([{ id: "article-2" }]);
		});

		it("still offers the newest Version when the Adapter omits listPinTargets", async () => {
			const user = userEvent.setup();
			const onError = vi.fn();
			// Stripped rather than failed: a Consumer that never implemented
			// pinning gets a degraded second step, not an error.
			const { listPinTargets, ...adapter } = createFakeReferenceAdapter();
			renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "release" },
				}),
				adapter,
				onError,
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");

			await user.click(
				within(step).getByRole("button", { name: /Newest version/ }),
			);
			expect(stored()).toEqual([{ id: "article-2" }]);
			// The omission is a configuration, not a failure.
			expect(onError).not.toHaveBeenCalled();
		});

		it("starts the next add over rather than reopening on the second step", async () => {
			const user = userEvent.setup();
			renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "release" },
				}),
			});

			await openPicker(user);
			await pickInStepOne(user, "Dogs of the world");
			await user.click(screen.getByRole("button", { name: "Cancel" }));

			await openPicker(user);

			expect(
				screen.queryByTestId("reference-picker-pin-step"),
			).not.toBeInTheDocument();
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

	describe("the caps", () => {
		/** A Field capped however the test needs, Blueprints left as they were. */
		function capped(settings: ReferenceSettings) {
			return makeField({ settings: { blueprints: ["article"], ...settings } });
		}

		describe("the add affordance", () => {
			it("is disabled once the tree is at max_items", async () => {
				renderField({
					field: capped({ max_items: 2 }),
					value: [{ id: "article-1" }, { id: "article-2" }],
				});

				await screen.findByText("Cats of the world");
				expect(addButton()).toBeDisabled();
			});

			it("counts a nested Reference towards the cap, not only the roots", async () => {
				// Two References, one of them a child: the cap is reached even
				// though only one of them is a root.
				renderField({
					field: capped({ max_items: 2 }),
					value: [{ id: "article-1", children: [{ id: "article-2" }] }],
				});

				await screen.findByText("Cats of the world");
				expect(addButton()).toBeDisabled();
			});

			it("stays available while the tree is under the cap", async () => {
				renderField({
					field: capped({ max_items: 2 }),
					value: [{ id: "article-1" }],
				});

				await screen.findByText("Cats of the world");
				expect(addButton()).toBeEnabled();
			});

			it("is never disabled by an unset max_items, however long the tree", async () => {
				// knkCMS core reads the cap as `settings.max_items ?? 0` and so
				// disables adding on an uncapped Field from the first render. An
				// unset cap is no cap.
				renderField({
					field: capped({}),
					value: [
						{ id: "article-1", children: [{ id: "article-2" }] },
						{ id: "article-3" },
					],
				});

				await screen.findByText("Cats of the world");
				expect(addButton()).toBeEnabled();
			});

			it("is disabled by a max_items of zero, which unset never is", async () => {
				renderField({ field: capped({ max_items: 0 }), value: [] });

				expect(addButton()).toBeDisabled();
			});
		});

		describe("stored data already over a cap", () => {
			it("blocks submit and reports on the Field when there are too many", async () => {
				const user = userEvent.setup();
				const { submitted } = renderField({
					field: capped({ max_items: 1 }),
					value: [{ id: "article-1" }, { id: "article-2" }],
				});

				await screen.findByText("Cats of the world");
				await user.click(screen.getByRole("button", { name: "Save" }));

				expect(
					await screen.findByText(`${LABEL} holds at most 1 reference`),
				).toBeInTheDocument();
				expect(submitted).not.toHaveBeenCalled();
			});

			it("blocks submit and reports when a branch is nested too deep", async () => {
				const user = userEvent.setup();
				const { submitted } = renderField({
					field: capped({ max_depth: 1 }),
					value: [{ id: "article-1", children: [{ id: "article-2" }] }],
				});

				await screen.findByText("Cats of the world");
				await user.click(screen.getByRole("button", { name: "Save" }));

				expect(
					await screen.findByText(`${LABEL} nests at most 1 level deep`),
				).toBeInTheDocument();
				expect(submitted).not.toHaveBeenCalled();
			});

			it("leaves the value exactly as it was rather than trimming it to fit", async () => {
				const user = userEvent.setup();
				const value = [
					{ id: "article-1", children: [{ id: "article-2" }] },
					{ id: "article-3" },
				];
				renderField({ field: capped({ max_items: 1, max_depth: 1 }), value });

				await screen.findByText("Cats of the world");
				await user.click(screen.getByRole("button", { name: "Save" }));

				await screen.findByText(`${LABEL} holds at most 1 reference`);
				// Reported, never repaired: nothing was truncated and nothing was
				// re-nested to satisfy either cap.
				expect(stored()).toEqual(value);
			});
		});
	});
});
