import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { DrawerRoot } from "@knkcs/anker/components";
import {
	act,
	createEvent,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { ReferenceSettings } from "../../../schema/field-types/reference";
import { REFERENCE_FIND_RESULT_CAP } from "../../../schema/reference-find";
import {
	initialReferenceFolds,
	REFERENCE_TREE_COLLAPSE_THRESHOLD,
	readReferenceTree,
	referenceDisplayName,
	visibleReferenceRows,
} from "../../../schema/reference-tree";
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
				? { blueprints: [{ blueprint: "article" }] }
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
	surround = (node) => node,
}: {
	field?: Field<ReferenceSettings>;
	value?: unknown;
	adapter?: FakeReferenceAdapter;
	adapters?: FieldKitAdapters;
	readOnly?: boolean;
	onError?: (error: Error, fieldId: string) => void;
	/** Wraps the Field in whatever it is being rendered inside — a real
	 * drawer, for the containment a Field in one depends on. */
	surround?: (node: React.ReactNode) => React.ReactNode;
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
							{surround(<FieldComponent field={field} readOnly={readOnly} />)}
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
		/** The slowest renders in the suite: under the gate's load (several
		 * auto-implement lanes at once) they outrun even `test:gate`'s 30s.
		 * A per-test timeout overrides the global one, so this must stay
		 * above it. */
		const AT_SIZE_BUDGET_MS = 120_000;

		it(
			"resolves every Reference in the tree, in calls no bigger than the batch size",
			async () => {
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
				const biggest = Math.max(...adapter.fetches.map((call) => call.length));
				expect(biggest).toBeLessThanOrEqual(REFERENCE_NAME_BATCH_SIZE);
			},
			AT_SIZE_BUDGET_MS,
		);

		it("shows the names the other batches resolved when one of them fails", async () => {
			const onError = vi.fn();
			// A root inside the second batch — only roots are on screen while the
			// tree is collapsed, and this one's name goes down with its call.
			const boundary = REFERENCE_NAME_BATCH_SIZE + 1;
			const lost = boundary % 2 === 1 ? boundary : boundary + 1;
			const adapter = createFakeReferenceAdapter({
				contents: fakeCatalogue(COUNT),
				failFetchIds: [`article-${String(lost)}`],
				failFetch: new Error("that batch was too much"),
			});
			renderField({ value: fakeReferenceTree(COUNT), adapter, onError });

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
			);

			// The rows whose batches answered read normally...
			expect(screen.getByText("Content 1")).toBeInTheDocument();
			// ...and the one that did not falls back to its id, exactly as a row
			// whose Content no longer resolves already does. The Field is degraded
			// where the failure was and nowhere else.
			expect(screen.getByText(`article-${String(lost)}`)).toBeInTheDocument();
		});

		it(
			"shows a name for a Reference nested inside a collapsed branch",
			async () => {
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
			},
			AT_SIZE_BUDGET_MS,
		);
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

			expect(stored()).toEqual([{ _id: expect.any(String), id: "article-2" }]);
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

			expect(stored()).toEqual([
				{ id: "article-1" },
				{ _id: expect.any(String), id: "article-2" },
			]);
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
			// The filter is a `select` Field: a BaseSelect, opened from the
			// keyboard, its option picked by label (#314).
			await user.type(
				within(picker).getByRole("combobox", { name: /Status/ }),
				"{ArrowDown}",
			);
			await user.click(await screen.findByText("Published"));

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
			expect(stored()).toEqual([{ _id: expect.any(String), id: "article-1" }]);
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
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "none",
					},
				}),
			});

			await openPicker(user);
			await user.click(await screen.findByText("Dogs of the world"));

			// Picked and stored in one move: no second step ever appeared, and
			// nothing asked the Adapter what this Content could be pinned to.
			expect(stored()).toEqual([{ _id: expect.any(String), id: "article-2" }]);
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

			expect(stored()).toEqual([{ _id: expect.any(String), id: "article-2" }]);
		});

		it("gains a second step listing that Content's Pin targets", async () => {
			const user = userEvent.setup();
			renderField({
				field: makeField({
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "release",
					},
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
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "release",
					},
				}),
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");

			// `"version"` is gone (ADR-0008, amended), so `"release"` is the one
			// kind of target left; what is still asserted is that the Field's
			// setting — nothing in the value — chose what was offered.
			expect(
				await within(step).findByRole("button", { name: /Spring release/ }),
			).toBeInTheDocument();
			expect(
				within(step).queryByRole("button", { name: /Version 3/ }),
			).not.toBeInTheDocument();
			// Asked for the Content that was picked, in the Field's mode.
			expect(adapter.pinTargetQueries).toEqual([
				{ contentId: "article-2", mode: "release" },
			]);
		});

		it("stores the Reference with only the target's id", async () => {
			const user = userEvent.setup();
			renderField({
				field: makeField({
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "release",
					},
				}),
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");
			await user.click(
				await within(step).findByRole("button", { name: /Spring release/ }),
			);

			// The id and nothing else — not the label, not which kind of target
			// it is. Only the Field's `pin_mode` says that (ADR-0008).
			expect(stored()).toEqual([
				{ _id: expect.any(String), id: "article-2", pin: "article-2-r2" },
			]);
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
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "release",
					},
				}),
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");
			await user.click(
				within(step).getByRole("button", { name: /Newest version/ }),
			);

			// No `pin` key, which is what "resolves to the newest Version"
			// looks like in stored data.
			expect(stored()).toEqual([{ _id: expect.any(String), id: "article-2" }]);
		});

		it("goes back to the browse without storing anything", async () => {
			const user = userEvent.setup();
			const { adapter } = renderField({
				field: makeField({
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "release",
					},
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
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "release",
					},
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
			expect(stored()).toEqual([{ _id: expect.any(String), id: "article-2" }]);
		});

		it("still offers the newest Version when the Adapter omits listPinTargets", async () => {
			const user = userEvent.setup();
			const onError = vi.fn();
			// Stripped rather than failed: a Consumer that never implemented
			// pinning gets a degraded second step, not an error.
			const { listPinTargets, ...adapter } = createFakeReferenceAdapter();
			renderField({
				field: makeField({
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "release",
					},
				}),
				adapter,
				onError,
			});

			await openPicker(user);
			const step = await pickInStepOne(user, "Dogs of the world");

			await user.click(
				within(step).getByRole("button", { name: /Newest version/ }),
			);
			expect(stored()).toEqual([{ _id: expect.any(String), id: "article-2" }]);
			// The omission is a configuration, not a failure.
			expect(onError).not.toHaveBeenCalled();
		});

		it("starts the next add over rather than reopening on the second step", async () => {
			const user = userEvent.setup();
			renderField({
				field: makeField({
					settings: {
						blueprints: [{ blueprint: "article" }],
						pin_mode: "release",
					},
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
					[ACCESSOR]: [{ _id: expect.any(String), id: "article-1" }],
				}),
			);
		});
	});

	describe("the caps", () => {
		/** A Field capped however the test needs, Blueprints left as they were. */
		function capped(settings: ReferenceSettings) {
			return makeField({
				settings: { blueprints: [{ blueprint: "article" }], ...settings },
			});
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

	/**
	 * Find, as the Field wires it (#148, contenthub #642): anker's icon search
	 * in the label row, on every non-empty tree.
	 *
	 * The matching is asserted in `src/schema/__tests__/reference-find.test.ts`,
	 * and which folds a Reveal opens in the tree model's own suite — plain
	 * assertions over data, no DOM. What is left for here is only what a
	 * component can be wrong about: that the control is where it should be,
	 * that typing opens the way down to a match and marks it without taking
	 * focus out of the input, that the counter steps, that Escape stays inside
	 * a drawer, and that none of it touches what is stored.
	 */
	/**
	 * A tree past the collapse threshold, and a catalogue to name it from.
	 *
	 * Shared by the two controls a tree that size carries — Find, and the
	 * Collapse all that is the way back from what Find opens.
	 */
	function renderTree(
		size: number,
		overrides: Parameters<typeof renderField>[0] = {},
	) {
		return renderField({
			adapter: createFakeReferenceAdapter({ contents: fakeCatalogue(size) }),
			value: fakeReferenceTree(size),
			...overrides,
		});
	}

	const FIND = "Find a Reference";

	function searchButton() {
		return screen.queryByRole("button", { name: FIND });
	}

	function searchInput() {
		return screen.queryByRole("searchbox", { name: FIND });
	}

	/** The search's input, opened from its icon if it is resting. */
	async function openSearch(): Promise<HTMLElement> {
		const open = searchInput();
		if (open) return open;
		const button = searchButton();
		if (!button) throw new Error("no search icon");
		fireEvent.click(button);
		return screen.findByRole("searchbox", { name: FIND });
	}

	/** Types a query into Find. */
	async function search(query: string): Promise<HTMLElement> {
		const input = await openSearch();
		fireEvent.change(input, { target: { value: query } });
		return input;
	}

	/** Waits out anker's debounce until the counter says `expected`. */
	async function expectCount(expected: string) {
		await waitFor(() => {
			expect(screen.getByTestId("reference-find-count")).toHaveTextContent(
				expected,
			);
		});
	}

	/** The row on screen showing `name`, or null when it is folded away. */
	function rowNamed(name: string): HTMLElement | null {
		return (
			screen
				.queryAllByTestId("reference-row")
				.find((row) => within(row).queryByText(name) !== null) ?? null
		);
	}

	/** Searches for `name`, which matches it alone, and waits for the Reveal. */
	async function reveal(name: string) {
		await search(name);
		await waitFor(() => {
			expect(rowNamed(name)).toHaveAttribute("data-revealed", "true");
		});
	}

	/** The Field's label row actions. */
	function labelActions(): HTMLElement {
		const actions = document.querySelector<HTMLElement>(
			"[data-field-label-actions]",
		);
		if (!actions) throw new Error("no label row actions");
		return actions;
	}

	describe("Find", () => {
		describe("where the control is", () => {
			it.each([
				3,
				REFERENCE_TREE_COLLAPSE_THRESHOLD + 5,
			])("offers a named search icon in the label row of a tree of %i, before Expand all and Collapse all", async (size) => {
				renderTree(size);
				await screen.findByText("Content 1");

				const buttons = within(labelActions()).getAllByRole("button");
				expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
					FIND,
					"Expand all",
					"Collapse all",
				]);
				expect(searchInput()).not.toBeInTheDocument();
			});

			it("offers it read-only too", async () => {
				renderTree(3, { readOnly: true });
				await screen.findByText("Content 1");

				expect(searchButton()).toBeInTheDocument();
			});

			it("offers none on an empty Field", async () => {
				renderField({ value: [] });

				expect(
					await screen.findByText("No references yet."),
				).toBeInTheDocument();
				expect(searchButton()).not.toBeInTheDocument();
			});

			it("draws no separate Find control any more", async () => {
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
				await screen.findByText("Content 1");

				expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
			});
		});

		describe("opening it", () => {
			it("opens with focus in the input on a click", async () => {
				renderTree(3);
				await screen.findByText("Content 1");

				const input = await openSearch();

				await waitFor(() => {
					expect(input).toHaveFocus();
				});
			});

			it("opens on / while the Field has focus", async () => {
				renderTree(3);
				await screen.findByText("Content 1");
				const grip = screen.getByRole("button", { name: "Reorder Content 1" });
				grip.focus();

				fireEvent.keyDown(grip, { key: "/" });

				const input = await screen.findByRole("searchbox", { name: FIND });
				await waitFor(() => {
					expect(input).toHaveFocus();
				});
			});

			it("claims no page-wide shortcut: / outside the Field does nothing", async () => {
				// The form's own field search claims "/" document-wide, so the
				// Field must not register a rival listener there.
				renderTree(3);
				await screen.findByText("Content 1");

				fireEvent.keyDown(document.body, { key: "/" });

				expect(searchInput()).not.toBeInTheDocument();
			});

			it("leaves / alone in a text box", async () => {
				renderTree(3);
				await screen.findByText("Content 1");
				const input = await openSearch();

				// A "/" typed into the search itself is a character, not a shortcut.
				const event = createEvent.keyDown(input, { key: "/" });
				fireEvent(input, event);

				expect(event.defaultPrevented).toBe(false);
			});
		});

		describe("what typing does", () => {
			it("opens every fold above a match, marks it and keeps focus in the input", async () => {
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
				await screen.findByText("Content 1");
				expect(rowNamed("Content 20")).toBeNull();

				const input = await search("Content 20");

				await waitFor(() => {
					expect(rowNamed("Content 20")).toHaveAttribute(
						"data-revealed",
						"true",
					);
				});
				expect(
					screen.getByRole("button", { name: "Collapse Content 19" }),
				).toHaveAttribute("aria-expanded", "true");
				await expectCount("1 of 1");
				expect(input).toHaveFocus();
				expect(
					screen
						.queryAllByTestId("reference-row")
						.filter((row) => row.getAttribute("data-revealed") === "true"),
				).toHaveLength(1);
			});

			it("counts the matches and steps through them in tree order, both ways", async () => {
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
				await screen.findByText("Content 1");

				// "Content 2" answers Content 2 (under 1), 20 (under 19) and 21.
				await search("Content 2");
				await expectCount("1 of 3");

				fireEvent.click(screen.getByRole("button", { name: "Next match" }));
				await expectCount("2 of 3");
				await waitFor(() => {
					expect(rowNamed("Content 20")).toHaveAttribute(
						"data-revealed",
						"true",
					);
				});

				fireEvent.click(screen.getByRole("button", { name: "Next match" }));
				await expectCount("3 of 3");
				fireEvent.click(screen.getByRole("button", { name: "Next match" }));
				await expectCount("1 of 3");
				fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
				await expectCount("3 of 3");
			});

			it("is never capped: every match can be stepped to", async () => {
				const size =
					Math.max(
						REFERENCE_TREE_COLLAPSE_THRESHOLD,
						REFERENCE_FIND_RESULT_CAP,
					) + 1;
				renderTree(size);
				await screen.findByText("Content 1");

				await search("Content");

				await expectCount(`1 of ${size}`);
			});

			it("says so when nothing in the tree matches", async () => {
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
				await screen.findByText("Content 1");

				await search("Pyrenees");

				await expectCount("No matches");
				expect(
					screen.getByRole("button", { name: "Previous match" }),
				).toBeDisabled();
			});

			it("scrolls the match to the centre of the viewport", async () => {
				const scrollIntoView = vi.fn();
				const had = Object.hasOwn(Element.prototype, "scrollIntoView");
				const original = Element.prototype.scrollIntoView;
				Element.prototype.scrollIntoView = scrollIntoView;
				try {
					renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
					await screen.findByText("Content 1");

					await reveal("Content 20");

					await waitFor(() => {
						expect(scrollIntoView).toHaveBeenCalledWith({
							block: "center",
							behavior: "smooth",
						});
					});
				} finally {
					if (had) Element.prototype.scrollIntoView = original;
					else
						delete (Element.prototype as { scrollIntoView?: unknown })
							.scrollIntoView;
				}
			});

			it("announces the Reveal, for an Author who is not watching the tree", async () => {
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
				await screen.findByText("Content 1");

				await reveal("Content 20");

				expect(screen.getByTestId("reference-reveal-notice")).toHaveTextContent(
					"Revealed Content 20",
				);
			});
		});

		describe("what a Reveal leaves alone", () => {
			it("leaves an earlier Reveal's folds open", async () => {
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
				await screen.findByText("Content 1");

				await reveal("Content 20");
				await reveal("Content 4");

				expect(rowNamed("Content 4")).not.toBeNull();
				expect(rowNamed("Content 20")).not.toBeNull();
			});

			it("leaves a fold an Author opened by hand alone", async () => {
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
				await screen.findByText("Content 1");
				fireEvent.click(
					screen.getByRole("button", { name: "Expand Content 5" }),
				);
				expect(rowNamed("Content 6")).not.toBeNull();

				await reveal("Content 20");

				expect(rowNamed("Content 6")).not.toBeNull();
			});

			it("changes nothing that is stored — order, nesting, Pins and values alike", async () => {
				const value = [
					...fakeReferenceTree(REFERENCE_TREE_COLLAPSE_THRESHOLD),
					{
						id: "article-21",
						pin: "article-21-v3",
						values: { page: 12 },
					},
				];
				renderTree(21, { value });
				await screen.findByText("Content 1");

				await reveal("Content 20");

				expect(stored()).toEqual(value);
			});
		});

		describe("closing it", () => {
			it("empties and closes on Escape, focus back on the icon", async () => {
				renderTree(3);
				await screen.findByText("Content 1");
				const input = await search("Content 2");
				await expectCount("1 of 1");

				fireEvent.keyDown(input, { key: "Escape" });

				await waitFor(() => {
					expect(searchInput()).not.toBeInTheDocument();
				});
				await waitFor(() => {
					expect(searchButton()).toHaveFocus();
				});
				expect(await openSearch()).toHaveValue("");
			});

			it("closes on Escape from the counter's buttons too, inside a drawer", async () => {
				const onClose = vi.fn();
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1, {
					surround: (node) => (
						<DrawerRoot open onClose={onClose} title="Edit">
							{node}
						</DrawerRoot>
					),
				});
				await screen.findByText("Content 1");
				await search("Content 2");
				await expectCount("1 of 3");
				const next = screen.getByRole("button", { name: "Next match" });
				next.focus();
				fireEvent.click(next);
				await expectCount("2 of 3");

				fireEvent.keyDown(next, { key: "Escape" });

				await waitFor(() => {
					expect(searchInput()).not.toBeInTheDocument();
				});
				expect(onClose).not.toHaveBeenCalled();
			});

			it("answers what was typed when Enter beats the debounce", async () => {
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
				await screen.findByText("Content 1");
				const input = await search("Content 2");
				await expectCount("1 of 3");

				// Typed and entered at once, before the search settles.
				fireEvent.change(input, { target: { value: "Content 20" } });
				fireEvent.keyDown(input, { key: "Enter" });

				await expectCount("1 of 1");
				expect(rowNamed("Content 20")).toHaveAttribute("data-revealed", "true");
				// And the debounce settling on the same query changes nothing.
				await new Promise((resolve) => setTimeout(resolve, 400));
				expect(screen.getByTestId("reference-find-count")).toHaveTextContent(
					"1 of 1",
				);
			});

			it("keeps a query on blur", async () => {
				renderTree(3);
				await screen.findByText("Content 1");
				await search("Content 2");
				await expectCount("1 of 1");

				act(() => {
					addButton().focus();
				});

				expect(searchInput()).toHaveValue("Content 2");
			});

			it("closes on Escape without closing the drawer around it", async () => {
				const onClose = vi.fn();
				renderTree(3, {
					surround: (node) => (
						<DrawerRoot open onClose={onClose} title="Edit">
							{node}
						</DrawerRoot>
					),
				});
				await screen.findByText("Content 1");
				const input = await search("Content 2");
				await expectCount("1 of 1");
				await waitFor(() => {
					expect(input).toHaveFocus();
				});

				fireEvent.keyDown(input, { key: "Escape" });

				await waitFor(() => {
					expect(searchInput()).not.toBeInTheDocument();
				});
				// A Reference Field is routinely rendered in a drawer, and losing
				// an Author's edits to the press that closed a search is the bug
				// the containment exists for.
				expect(onClose).not.toHaveBeenCalled();
			});
		});

		describe("where there are no names to find by", () => {
			it("offers no input with no Adapter configured, but reads as read mode does — Find included", async () => {
				renderField({
					adapters: {},
					value: fakeReferenceTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1),
				});

				expect(
					screen.getByText("Reference adapter not configured"),
				).toBeInTheDocument();
				expect(await screen.findByText("article-1")).toBeInTheDocument();
				expect(searchButton()).toBeInTheDocument();
				expect(
					screen.queryByRole("button", { name: /add|remove/i }),
				).not.toBeInTheDocument();
			});

			it("matches the ids the rows are left showing after a failed lookup", async () => {
				renderField({
					adapter: createFakeReferenceAdapter({
						contents: fakeCatalogue(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1),
						failFetch: new Error("gateway down"),
					}),
					value: fakeReferenceTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1),
					onError: vi.fn(),
				});
				expect(await screen.findByText("article-1")).toBeInTheDocument();

				await reveal("article-20");
			});
		});

		/**
		 * No match, not yet, and not all of it (#152) — the counter says which
		 * state the names are in, so a count is never read as a whole tree
		 * searched when it was not.
		 */
		describe("while the names are still arriving", () => {
			function renderResolving(
				size: number = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1,
			) {
				return renderTree(size, {
					adapter: createFakeReferenceAdapter({
						contents: fakeCatalogue(size),
						holdFetch: true,
					}),
				});
			}

			it("says the names are still resolving rather than that nothing matched, announced", async () => {
				renderResolving();
				await screen.findByText("article-1");

				await search("Content 20");

				await expectCount("Resolving names…");
				expect(screen.getByTestId("reference-find-count")).toHaveAttribute(
					"role",
					"status",
				);
			});

			it("counts what it can already answer, and still says it is not done", async () => {
				renderResolving();
				await screen.findByText("article-1");

				await search("article-20");

				await expectCount("1 of 1 · resolving names");
			});

			it("answers again as the names land, without the Author retyping", async () => {
				const { adapter } = renderResolving();
				await screen.findByText("article-1");
				await search("Content 20");
				await expectCount("Resolving names…");

				await act(async () => {
					adapter.releaseFetches();
				});

				await expectCount("1 of 1");
				await waitFor(() => {
					expect(rowNamed("Content 20")).toHaveAttribute(
						"data-revealed",
						"true",
					);
				});
			});

			describe("when some of the names never came", () => {
				function renderPartlyFailed() {
					const size = REFERENCE_NAME_BATCH_SIZE + 20;
					renderTree(size, {
						adapter: createFakeReferenceAdapter({
							contents: fakeCatalogue(size),
							failFetchIds: [
								`article-${String(REFERENCE_NAME_BATCH_SIZE + 1)}`,
							],
							failFetch: new Error("gateway down"),
						}),
						onError: vi.fn(),
					});
				}

				it("does not report an absence as though it had searched the tree", async () => {
					renderPartlyFailed();
					await screen.findByText("Content 1");

					await search("Pyrenees");

					await expectCount("No matches · some names unresolved");
				});

				it("says the same of a count", async () => {
					renderPartlyFailed();
					await screen.findByText("Content 1");

					await search("Content 20");

					await expectCount("1 of 1 · some names unresolved");
				});
			});
		});
	});

	/**
	 * Collapse all (#150).
	 *
	 * Reveals accumulate and a fold an Author opened by hand is never fought,
	 * so a tree sprawls open as it is worked. This is the way back, in one act
	 * rather than a chevron per branch — and it is worth having at this size
	 * whether or not anyone used Find to get here.
	 *
	 * What a fold set hides, and the set a tree opens with, are asserted in the
	 * tree model's own suite with no DOM at all. What is left for here is what
	 * a control can be wrong about: that it appears on the trees that open
	 * folded, that it returns the tree to *that* set rather than to some other
	 * empty, that it reaches folds opened either way, and that it writes
	 * nothing.
	 */
	describe("Collapse all", () => {
		function collapseControl() {
			return screen.queryByRole("button", { name: "Collapse all" });
		}

		/** The names of the rows on screen, top to bottom. */
		function shownNames(): string[] {
			return screen
				.queryAllByTestId("reference-row-name")
				.map((node) => node.textContent ?? "");
		}

		/**
		 * The rows the tree model says a tree of this size opens with — the
		 * answer the control is held against, read off the shared functions
		 * rather than off the control being tested or off a list written out
		 * here. A control that restated the rule instead of calling it would
		 * have to agree with this to pass.
		 */
		function opensWith(size: number): string[] {
			const rows = readReferenceTree(fakeReferenceTree(size));
			const names = Object.fromEntries(
				fakeCatalogue(size).map((content) => [
					content.id,
					content.display_name,
				]),
			);
			return visibleReferenceRows(rows, initialReferenceFolds(rows)).map(
				(row) => referenceDisplayName(row, names),
			);
		}

		describe("when the controls appear", () => {
			it.each([
				3,
				REFERENCE_TREE_COLLAPSE_THRESHOLD - 1,
				REFERENCE_TREE_COLLAPSE_THRESHOLD,
				REFERENCE_TREE_COLLAPSE_THRESHOLD + 1,
			])("offers Expand all and Collapse all on a tree of %i, whatever it opened as", async (size) => {
				renderTree(size);

				expect(await screen.findByText("Content 1")).toBeInTheDocument();
				expect(collapseControl()).toBeInTheDocument();
				expect(
					screen.getByRole("button", { name: "Expand all" }),
				).toBeInTheDocument();
			});

			it("offers neither on an empty Field", () => {
				renderField();

				expect(collapseControl()).not.toBeInTheDocument();
				expect(
					screen.queryByRole("button", { name: "Expand all" }),
				).not.toBeInTheDocument();
			});

			it("folds a tree grown past the threshold to its top level", async () => {
				const user = userEvent.setup();
				renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD, {
					adapter: createFakeReferenceAdapter({
						contents: fakeCatalogue(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1),
					}),
				});
				await screen.findByText("Content 1");

				await openPicker(user);
				await user.click(await screen.findByText("Content 21"));
				await screen.findByText("Content 21");

				fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
				// Every branch folded over the rows as they stand, the one just
				// added among them.
				expect(shownNames()).toEqual(
					opensWith(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1),
				);
			});
		});

		it("opens every branch with Expand all, and folds still toggle after", async () => {
			const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
			renderTree(size);
			await screen.findByText("Content 1");
			expect(shownNames().length).toBeLessThan(size);

			fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
			expect(shownNames()).toHaveLength(size);

			fireEvent.click(
				screen.getByRole("button", { name: "Collapse Content 1" }),
			);
			expect(rowNamed("Content 2")).toBeNull();
			fireEvent.click(screen.getByRole("button", { name: "Expand Content 1" }));
			expect(rowNamed("Content 2")).not.toBeNull();
		});

		it("folds a small tree, which opened expanded, to its top level", async () => {
			renderTree(4);
			await screen.findByText("Content 1");
			expect(shownNames()).toHaveLength(4);

			fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

			expect(shownNames()).toEqual(["Content 1", "Content 3"]);
		});

		it("returns the tree to exactly the rows it opened with", async () => {
			const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
			renderTree(size);
			await screen.findByText("Content 1");
			const opened = shownNames();
			// The tree opened folded, so this is the roots rather than everything.
			expect(opened).toEqual(opensWith(size));
			expect(opened.length).toBeLessThan(size);

			fireEvent.click(screen.getByRole("button", { name: "Expand Content 5" }));
			await reveal("Content 20");
			expect(shownNames()).not.toEqual(opened);

			fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

			// The state it opened in, not some other empty: every root still on
			// screen, in order, and nothing under any of them.
			expect(shownNames()).toEqual(opened);
		});

		it("folds away a branch a Reveal opened", async () => {
			renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");
			await reveal("Content 20");
			expect(rowNamed("Content 20")).not.toBeNull();

			fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

			// A Reveal is not undone by anything that happens to the tree — but
			// it is not exempt from the way back either.
			expect(rowNamed("Content 20")).toBeNull();
		});

		it("folds away a branch an Author opened by hand", async () => {
			renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");
			fireEvent.click(screen.getByRole("button", { name: "Expand Content 5" }));
			expect(rowNamed("Content 6")).not.toBeNull();

			fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

			expect(rowNamed("Content 6")).toBeNull();
		});

		it("changes nothing that is stored — order, nesting, Pins and values alike", async () => {
			const value = [
				...fakeReferenceTree(REFERENCE_TREE_COLLAPSE_THRESHOLD),
				{ id: "article-21", pin: "article-21-v3", values: { page: 12 } },
			];
			renderTree(21, { value });
			await screen.findByText("Content 1");
			await reveal("Content 20");

			fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

			// Folding is control state, never the value's (ADR-0008).
			expect(stored()).toEqual(value);
		});

		it("is reached and operated from the keyboard, under a name of its own", async () => {
			const user = userEvent.setup();
			renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");
			fireEvent.click(screen.getByRole("button", { name: "Expand Content 5" }));
			expect(rowNamed("Content 6")).not.toBeNull();

			// Tabbed to from the control beside it rather than focused outright,
			// which a `tabindex="-1"` element would answer to just as well.
			screen.getByRole("button", { name: "Expand all" }).focus();
			await user.tab();
			expect(collapseControl()).toHaveFocus();
			await user.keyboard("{Enter}");

			expect(rowNamed("Content 6")).toBeNull();
		});

		it("leaves a Reveal after it opening the way down as normal", async () => {
			renderTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");
			await reveal("Content 20");

			fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
			expect(rowNamed("Content 20")).toBeNull();

			// The same Reference again, which is the ask an Author makes by
			// collapsing and then wanting back where they were: stepping to the
			// only match is a Reveal of it.
			fireEvent.click(screen.getByRole("button", { name: "Next match" }));

			await waitFor(() => {
				expect(rowNamed("Content 20")).not.toBeNull();
			});
			expect(rowNamed("Content 20")).toHaveAttribute("data-revealed", "true");
		});
	});
});

describe("a Blueprint's linked Reference Spec", () => {
	function valueField(
		fieldType: string,
		accessor: string,
		name: string,
	): Field {
		return {
			field_type: fieldType,
			config: {
				name,
				api_accessor: accessor,
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
	}

	it("asks a Reference for its own Blueprint's Spec, and everything else for the Field's", async () => {
		const user = userEvent.setup();
		// Which Blueprint a target belongs to comes from the Adapter's `fetch`
		// — the stored value says nothing about it.
		const adapter = createFakeReferenceAdapter({
			contents: [
				{ id: "book-1", display_name: "Moby Dick", blueprint_id: "book" },
				{
					id: "article-1",
					display_name: "Cats of the world",
					blueprint_id: "article",
				},
			],
		});
		renderField({
			adapter,
			field: makeField({
				settings: {
					blueprints: [
						{
							blueprint: "book",
							spec_blueprint: "r1",
							spec: [valueField("number", "chapter", "Chapter")],
						},
					],
					spec: [valueField("text", "note", "Note")],
				},
			}),
			value: [
				{ _id: "row-book", id: "book-1" },
				{ _id: "row-article", id: "article-1" },
			],
		});

		// The linked Spec is used instead of the embedded one, never merged.
		await user.click(
			await screen.findByRole("button", { name: /^Values for Moby Dick/ }),
		);
		let drawer = await screen.findByTestId("reference-values-drawer");
		expect(within(drawer).getByText("Chapter")).toBeInTheDocument();
		expect(within(drawer).queryByText("Note")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Done" }));
		await waitFor(() =>
			expect(screen.queryByTestId("reference-values-drawer")).toBeNull(),
		);

		// A Blueprint with no linked Spec falls back to the Field's own.
		await user.click(
			screen.getByRole("button", { name: /^Values for Cats of the world/ }),
		);
		drawer = await screen.findByTestId("reference-values-drawer");
		expect(within(drawer).getByText("Note")).toBeInTheDocument();
		expect(within(drawer).queryByText("Chapter")).toBeNull();
	});
});
