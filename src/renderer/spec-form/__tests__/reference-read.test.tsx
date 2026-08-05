import { Provider } from "@knkcs/anker/primitives";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { ReferenceSettings } from "../../../schema/field-types/reference";
import { createReferencePlugin } from "../../../schema/field-types/reference";
import {
	initialReferenceFolds,
	REFERENCE_TREE_COLLAPSE_THRESHOLD,
	readReferenceTree,
	referenceDisplayName,
	visibleReferenceRows,
} from "../../../schema/reference-tree";
import type { Field } from "../../../schema/types";
import {
	createFakeReferenceAdapter,
	type FakeReferenceAdapter,
	fakeCatalogue,
	fakeReferenceTree,
} from "../../../test/fake-reference-adapter";
import { ReferenceTree } from "../../fields/reference-tree";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const attribute = (accessor: string, name: string): Field => ({
	field_type: "text",
	config: { name, api_accessor: accessor, required: false, instructions: "" },
	settings: null,
	children: null,
	system: false,
});

/** A Field that declares one Attribute — the case most of these tests want. */
const WITH_PAGE: ReferenceSettings = {
	blueprints: ["article"],
	attributes: [attribute("page", "Page")],
};

function referenceField(
	settings: ReferenceSettings = WITH_PAGE,
	fieldType = "reference",
): Field<ReferenceSettings> {
	return {
		field_type: fieldType,
		config: {
			name: "Related articles",
			api_accessor: "related",
			required: false,
			instructions: "",
		},
		settings,
		children: null,
		system: false,
	};
}

function renderRead(
	values: Record<string, unknown>,
	field: Field<ReferenceSettings> = referenceField(),
	adapter: FakeReferenceAdapter = createFakeReferenceAdapter(),
	plugins = builtInFieldTypes,
) {
	// No FormProvider on purpose: read mode must not require a form.
	return render(
		<Provider>
			<FieldKitProvider plugins={plugins} adapters={{ reference: adapter }}>
				<SpecForm schema={[field as Field]} mode="read" values={values} />
			</FieldKitProvider>
		</Provider>,
	);
}

describe("SpecForm — read mode, reference tree", () => {
	it("bypasses the count cell and renders the tree", async () => {
		renderRead({ related: [{ id: "article-1" }, { id: "article-2" }] });

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Dogs of the world")).toBeInTheDocument();
		// The table cell's answer — a count — must not be what read mode shows.
		expect(screen.queryByText("2 references")).not.toBeInTheDocument();
	});

	it("resolves each Content's current name through the Adapter", async () => {
		const adapter = createFakeReferenceAdapter();
		adapter.rename("article-1", "Cats of the whole world");

		renderRead({ related: [{ id: "article-1" }] }, referenceField(), adapter);

		expect(
			await screen.findByText("Cats of the whole world"),
		).toBeInTheDocument();
	});

	it("keeps the id of a Content it cannot resolve on screen", async () => {
		renderRead({ related: [{ id: "deleted-42" }] });

		expect(await screen.findByText("deleted-42")).toBeInTheDocument();
	});

	it("makes the nesting visible", async () => {
		renderRead({
			related: [
				{
					id: "article-1",
					children: [{ id: "article-2", children: [{ id: "article-3" }] }],
				},
			],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-read-row");
		expect(rows.map((row) => row.getAttribute("data-depth"))).toEqual([
			"0",
			"1",
			"2",
		]);
	});

	it("shows every Reference in the tree, nested ones included", async () => {
		renderRead({
			related: [{ id: "article-1", children: [{ id: "author-1" }] }],
		});

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
	});

	it("shows each Reference's Attribute values against it", async () => {
		renderRead({
			related: [
				{ id: "article-1", attributes: { page: "12" } },
				{ id: "article-2", attributes: { page: "88" } },
			],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-read-row");
		expect(rows[0]).toHaveTextContent("Page");
		expect(rows[0]).toHaveTextContent("12");
		expect(rows[1]).toHaveTextContent("88");
		// Each value sits under the Reference it belongs to, not pooled.
		expect(rows[0]).not.toHaveTextContent("88");
	});

	it("shows a nested Reference's Attributes on the nested Reference", async () => {
		renderRead({
			related: [
				{
					id: "article-1",
					attributes: { page: "12" },
					children: [{ id: "article-2", attributes: { page: "88" } }],
				},
			],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-read-row");
		expect(rows[1]).toHaveTextContent("Dogs of the world");
		expect(rows[1]).toHaveTextContent("88");
	});

	it("renders an em dash for an Attribute nobody filled in", async () => {
		renderRead({ related: [{ id: "article-1" }] });

		await screen.findByText("Cats of the world");
		expect(screen.getByTestId("reference-read-row")).toHaveTextContent("—");
	});

	it("renders no Attribute rows when the Field declares none", async () => {
		renderRead(
			{ related: [{ id: "article-1", attributes: { page: "12" } }] },
			referenceField({ blueprints: ["article"] }),
		);

		await screen.findByText("Cats of the world");
		expect(screen.queryByText("Page")).not.toBeInTheDocument();
		expect(screen.queryByText("12")).not.toBeInTheDocument();
	});

	it("renders an em dash for an empty tree", () => {
		renderRead({ related: [] });

		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("renders an em dash for a value that is not a Reference Tree", () => {
		renderRead({ related: "article-1" });

		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("gives a Consumer's own reference-shaped type the same read mode", async () => {
		// The read component travels with the plugin, so a type minted by
		// `createReferencePlugin` cannot drift from `reference` — which a
		// `field_type === "reference"` check in shared machinery could never
		// have managed (ADR-0010).
		const tocReference = createReferencePlugin({
			id: "toc_reference",
			name: "TOC Reference",
		});

		renderRead(
			{ related: [{ id: "article-1" }] },
			referenceField({ blueprints: ["article"] }, "toc_reference"),
			createFakeReferenceAdapter(),
			[...builtInFieldTypes, tocReference],
		);

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.queryByText("1 reference")).not.toBeInTheDocument();
	});
});

/**
 * A read-mode Field over a catalogue big enough to name `size` References,
 * and the tree of `size` References that points at it.
 */
function renderReadTree(
	size: number,
	value: unknown = fakeReferenceTree(size),
) {
	return renderRead(
		{ related: value },
		referenceField(),
		createFakeReferenceAdapter({ contents: fakeCatalogue(size) }),
	);
}

/** The names of the rows read mode is drawing, top to bottom. */
function readNames(container: HTMLElement = document.body): string[] {
	return within(container)
		.queryAllByTestId("reference-read-name")
		.map((node) => node.textContent ?? "");
}

/** Every id in {@link fakeCatalogue} against its display name — the map the
 * editable tree is handed, and the one read mode resolves for itself. */
function catalogueNames(size: number): Record<string, string> {
	return Object.fromEntries(
		fakeCatalogue(size).map((content) => [content.id, content.display_name]),
	);
}

/**
 * Folding in read mode (#153).
 *
 * Which rows a fold set hides, and which folds a Reveal opens, are asserted
 * in the tree model's own suite with plain assertions and no DOM. What is
 * left for here is what a renderer can be wrong about: how big a tree opens,
 * and that a fold can be worked while reading.
 */
describe("SpecForm — read mode, folding the tree", () => {
	it("opens fully expanded at exactly the collapse threshold", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD;
		renderReadTree(size);

		await screen.findByText("Content 1");
		expect(screen.getAllByTestId("reference-read-row")).toHaveLength(size);
	});

	it("opens fully expanded one Reference below the threshold", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD - 1;
		renderReadTree(size);

		await screen.findByText("Content 1");
		expect(screen.getAllByTestId("reference-read-row")).toHaveLength(size);
	});

	it("opens collapsed above the threshold, showing its roots", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 2;
		renderReadTree(size);

		await screen.findByText("Content 1");
		// Only the roots: a record read-only with ten thousand References is no
		// longer ten thousand rows on the page.
		expect(screen.getAllByTestId("reference-read-row")).toHaveLength(size / 2);
		expect(
			screen.getByRole("button", { name: "Expand Content 1" }),
		).toHaveAttribute("aria-expanded", "false");
	});

	it("opens and closes a fold while reading, because reading a folded branch is reading", async () => {
		renderRead({
			related: [{ id: "article-1", children: [{ id: "article-2" }] }],
		});
		await screen.findByText("Cats of the world");

		fireEvent.click(
			screen.getByRole("button", { name: "Collapse Cats of the world" }),
		);
		expect(readNames()).toEqual(["Cats of the world"]);

		fireEvent.click(
			screen.getByRole("button", { name: "Expand Cats of the world" }),
		);
		expect(readNames()).toEqual(["Cats of the world", "Dogs of the world"]);
	});

	it("puts no fold control on a Reference with nothing under it", async () => {
		renderRead({ related: [{ id: "article-1" }] });

		await screen.findByText("Cats of the world");
		// A control claiming to collapse a leaf would claim it hides something.
		expect(
			screen.queryByRole("button", { name: /Cats of the world/ }),
		).not.toBeInTheDocument();
	});

	it("keeps a fold out of the value it was handed", async () => {
		const value = [{ id: "article-1", children: [{ id: "article-2" }] }];
		const before = structuredClone(value);
		renderRead({ related: value });
		await screen.findByText("Cats of the world");

		fireEvent.click(
			screen.getByRole("button", { name: "Collapse Cats of the world" }),
		);

		// Folding is control state, never the value's (ADR-0008) — and read
		// mode writes nothing at all.
		expect(value).toEqual(before);
	});
});

/**
 * The agreement itself (#153): both renderers are held against the shared
 * functions rather than against each other, so neither can be right only
 * because the other is wrong in the same way.
 */
describe("read mode and the editable tree agree about what a fold hides", () => {
	function renderEditable(value: unknown[], size: number) {
		return render(
			<Provider>
				<ReferenceTree
					rows={readReferenceTree(value)}
					value={value}
					names={catalogueNames(size)}
					onChange={() => {}}
				/>
			</Provider>,
		);
	}

	/** The names of the rows the editable tree is drawing, top to bottom. */
	function editableNames(container: HTMLElement): string[] {
		return within(container)
			.queryAllByTestId("reference-row-name")
			.map((node) => node.textContent ?? "");
	}

	it("draws the rows the shared fold set leaves visible, in both renderers", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 2;
		const value = fakeReferenceTree(size);
		const rows = readReferenceTree(value);
		const names = catalogueNames(size);
		// The one answer both are held to, read off the shared functions rather
		// than off either renderer.
		const expected = visibleReferenceRows(
			rows,
			initialReferenceFolds(rows),
		).map((row) => referenceDisplayName(row, names));

		const reading = renderReadTree(size, value);
		await screen.findByText("Content 1");
		const editing = renderEditable(value, size);

		expect(readNames(reading.container)).toEqual(expected);
		expect(editableNames(editing.container)).toEqual(expected);
	});

	it("agrees about the branch one fold an Author closed hides", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD - 2;
		const value = fakeReferenceTree(size);
		const rows = readReferenceTree(value);
		const names = catalogueNames(size);
		// Small enough to open expanded, so the only fold either renderer has
		// is the one closed below.
		const closed = rows.find(
			(row) => referenceDisplayName(row, names) === "Content 3",
		);
		if (!closed) throw new Error("no row to fold");
		const expected = visibleReferenceRows(rows, new Set([closed.key])).map(
			(row) => referenceDisplayName(row, names),
		);

		const reading = renderReadTree(size, value);
		await screen.findByText("Content 1");
		const editing = renderEditable(value, size);
		for (const container of [reading.container, editing.container]) {
			fireEvent.click(
				within(container).getByRole("button", { name: "Collapse Content 3" }),
			);
		}

		expect(readNames(reading.container)).toEqual(expected);
		expect(editableNames(editing.container)).toEqual(expected);
	});
});

/**
 * Find and Reveal in read mode (#153) — the same control the editable tree
 * carries, over the same functions.
 *
 * What a query matches, and the ancestor path it is shown under, are asserted
 * in `src/schema/__tests__/reference-find.test.ts`. What is left for here is
 * the wiring: that the control appears on the trees that open collapsed, that
 * picking a result opens the way down to the row, lands on it and marks it,
 * and that none of it writes.
 */
function findControl() {
	return screen.queryByRole("combobox", { name: "Find a Reference" });
}

/** Types a query into Find and waits out anker's search debounce. */
async function findFor(query: string) {
	const input = screen.getByRole("combobox", { name: "Find a Reference" });
	fireEvent.change(input, { target: { value: query } });
	await screen.findByRole("listbox");
	return screen.queryAllByRole("option");
}

/** The row on screen showing `name`, or null while it is folded away. */
function rowNamed(name: string): HTMLElement | null {
	return (
		screen
			.queryAllByTestId("reference-read-row")
			.find(
				(row) =>
					within(row).queryByTestId("reference-read-name")?.textContent ===
					name,
			) ?? null
	);
}

/** Finds `name` and picks the only result, which is a Reveal. */
async function reveal(name: string) {
	const options = await findFor(name);
	expect(options).toHaveLength(1);
	fireEvent.click(options[0]);
	await waitFor(() => {
		expect(rowNamed(name)).not.toBeNull();
	});
}

describe("SpecForm — read mode, Find and Reveal", () => {
	describe("when the control appears", () => {
		it("offers Find on a tree past the collapse threshold", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);

			expect(await screen.findByText("Content 1")).toBeInTheDocument();
			expect(findControl()).toBeInTheDocument();
		});

		it("offers none at exactly the threshold, where the tree opens expanded", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD);

			expect(await screen.findByText("Content 1")).toBeInTheDocument();
			expect(findControl()).not.toBeInTheDocument();
		});

		it("offers none one Reference below the threshold", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD - 1);

			expect(await screen.findByText("Content 1")).toBeInTheDocument();
			expect(findControl()).not.toBeInTheDocument();
		});

		it("offers none on an empty value", () => {
			renderRead({ related: [] });

			expect(findControl()).not.toBeInTheDocument();
		});
	});

	it("finds a Reference the tree opened with folded away", async () => {
		renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
		await screen.findByText("Content 1");
		// Not on screen at all — which is the problem Find exists for, and it
		// is as real when reading as when editing.
		expect(rowNamed("Content 20")).toBeNull();

		const options = await findFor("Content 20");

		expect(options).toHaveLength(1);
		// Under the path leading to it, so two Contents named alike are told
		// apart before an Author commits to jumping.
		expect(within(options[0]).getByText("Content 19")).toBeInTheDocument();
	});

	describe("what a Reveal does", () => {
		it("opens every fold above the Reference that was picked", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await reveal("Content 20");

			expect(rowNamed("Content 20")).not.toBeNull();
			expect(
				screen.getByRole("button", { name: "Collapse Content 19" }),
			).toHaveAttribute("aria-expanded", "true");
		});

		it("lands focus on the revealed row", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await reveal("Content 20");

			await waitFor(() => {
				expect(rowNamed("Content 20")).toHaveFocus();
			});
		});

		it("scrolls the revealed row to the centre of the viewport", async () => {
			// jsdom implements no scrolling at all, so the row's own method is
			// what a test can read — and it is put back afterwards, since
			// defining it changes what every later test in this file sees.
			const scrollIntoView = vi.fn();
			const had = Object.hasOwn(Element.prototype, "scrollIntoView");
			const original = Element.prototype.scrollIntoView;
			Element.prototype.scrollIntoView = scrollIntoView;
			try {
				renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
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

		it("marks the revealed row, and marks only it", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await reveal("Content 20");

			await waitFor(() => {
				expect(rowNamed("Content 20")).toHaveAttribute("data-revealed", "true");
			});
			expect(
				screen
					.queryAllByTestId("reference-read-row")
					.filter((row) => row.getAttribute("data-revealed") === "true"),
			).toHaveLength(1);
		});

		it("announces the Reveal, for an Author who is not watching the tree", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await reveal("Content 20");

			await waitFor(() => {
				expect(
					screen.getByTestId("reference-read-reveal-notice"),
				).toHaveTextContent("Revealed Content 20");
			});
		});

		it("leaves an earlier Reveal's folds open", async () => {
			// A Reveal is an answer, not a preview: it does not fold back, and
			// undoing the last one would undo work an Author just did.
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await reveal("Content 20");
			await reveal("Content 4");

			expect(rowNamed("Content 4")).not.toBeNull();
			expect(rowNamed("Content 20")).not.toBeNull();
		});

		it("works the second time the same Reference is asked for", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await reveal("Content 20");
			await waitFor(() => {
				expect(rowNamed("Content 20")).toHaveFocus();
			});
			// An Author looks away, then wants back where they were.
			screen.getByRole("combobox", { name: "Find a Reference" }).focus();
			expect(rowNamed("Content 20")).not.toHaveFocus();

			await reveal("Content 20");

			await waitFor(() => {
				expect(rowNamed("Content 20")).toHaveFocus();
			});
		});
	});

	it("writes nothing to the value it was handed", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
		const value = fakeReferenceTree(size);
		const before = structuredClone(value);
		renderReadTree(size, value);
		await screen.findByText("Content 1");

		await reveal("Content 20");
		fireEvent.click(
			screen.getByRole("button", { name: "Collapse Content 19" }),
		);

		// Find changes what is folded and where an Author is looking. Nothing
		// else — and read mode has nowhere to write it even if it wanted to.
		expect(value).toEqual(before);
	});

	it("matches the ids the rows are left showing when nothing resolves", async () => {
		// Find degrades exactly as the rows do (ADR-0013): with no names, an id
		// is what is on screen.
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
		renderRead(
			{ related: fakeReferenceTree(size) },
			referenceField(),
			createFakeReferenceAdapter({
				contents: fakeCatalogue(size),
				failFetch: new Error("gateway down"),
			}),
		);
		expect(await screen.findByText("article-1")).toBeInTheDocument();

		await reveal("article-20");

		expect(rowNamed("article-20")).not.toBeNull();
	});

	it("still finds by id with no Adapter configured at all", async () => {
		// Unlike the editable Field, read mode has no "adapter not configured"
		// branch: it draws the tree whatever resolves, so the screen here is
		// the *same* screen a failed lookup leaves behind — every row showing
		// its id. Offering Find on one and not the other would be a difference
		// an Author can see and cannot explain.
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
		render(
			<Provider>
				<FieldKitProvider plugins={builtInFieldTypes} adapters={{}}>
					<SpecForm
						schema={[referenceField() as Field]}
						mode="read"
						values={{ related: fakeReferenceTree(size) }}
					/>
				</FieldKitProvider>
			</Provider>,
		);
		expect(await screen.findByText("article-1")).toBeInTheDocument();

		await reveal("article-20");

		expect(rowNamed("article-20")).not.toBeNull();
	});

	it("says the names are still arriving rather than that nothing matched", async () => {
		// The third Find state reaches read mode too (#152). Reading a record
		// is where an Author is most likely to be *checking* whether something
		// is in the tree, and a control that answered "no" before it knew would
		// be believed.
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
		const adapter = createFakeReferenceAdapter({
			contents: fakeCatalogue(size),
			holdFetch: true,
		});
		renderRead({ related: fakeReferenceTree(size) }, referenceField(), adapter);
		await screen.findByText("article-1");

		expect(await findFor("Content 20")).toHaveLength(0);

		expect(screen.getByText("Still resolving names…")).toBeInTheDocument();
		expect(
			screen.queryByText("No matching References"),
		).not.toBeInTheDocument();

		await act(async () => {
			adapter.releaseFetches();
		});

		// And the same query answers as soon as they land, unretyped — the two
		// renderers agree about this as they agree about folds and Reveals.
		const options = await screen.findAllByRole("option");
		expect(options).toHaveLength(1);
		expect(within(options[0]).getByText("Content 20")).toBeInTheDocument();
	});
});

/**
 * Collapse all in read mode (#150).
 *
 * A read-mode tree opens folded and its Reveals accumulate, exactly as the
 * editable one's do, so it sprawls open on the same terms and wants the same
 * way back. The control is the editable tree's, placed by this renderer.
 */
describe("SpecForm — read mode, Collapse all", () => {
	function collapseControl() {
		return screen.queryByRole("button", { name: "Collapse all" });
	}

	/**
	 * The rows the tree model says a tree of this size opens with — the answer
	 * the control is held against, read off the shared functions rather than
	 * off the renderer being tested.
	 */
	function opensWith(size: number): string[] {
		const rows = readReferenceTree(fakeReferenceTree(size));
		const names = catalogueNames(size);
		return visibleReferenceRows(rows, initialReferenceFolds(rows)).map((row) =>
			referenceDisplayName(row, names),
		);
	}

	it("offers Collapse all on a tree that opens collapsed", async () => {
		renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);

		expect(await screen.findByText("Content 1")).toBeInTheDocument();
		expect(collapseControl()).toBeInTheDocument();
	});

	it("offers none at exactly the threshold, where the tree opens expanded", async () => {
		renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD);

		expect(await screen.findByText("Content 1")).toBeInTheDocument();
		expect(collapseControl()).not.toBeInTheDocument();
	});

	it("offers none one Reference below the threshold", async () => {
		renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD - 1);

		expect(await screen.findByText("Content 1")).toBeInTheDocument();
		expect(collapseControl()).not.toBeInTheDocument();
	});

	it("returns the tree to exactly the rows it opened with", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
		renderReadTree(size);
		await screen.findByText("Content 1");
		const opened = readNames();
		expect(opened).toEqual(opensWith(size));

		// One fold opened by hand and one by a Reveal — the control reaches both.
		fireEvent.click(screen.getByRole("button", { name: "Expand Content 5" }));
		await reveal("Content 20");
		expect(readNames()).not.toEqual(opened);

		fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

		expect(readNames()).toEqual(opened);
	});

	it("writes nothing to the value it was handed", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
		const value = fakeReferenceTree(size);
		const before = structuredClone(value);
		renderReadTree(size, value);
		await screen.findByText("Content 1");
		await reveal("Content 20");

		fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

		expect(value).toEqual(before);
	});

	it("leaves a Reveal after it opening the way down as normal", async () => {
		renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
		await screen.findByText("Content 1");
		await reveal("Content 20");

		fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(rowNamed("Content 20")).toBeNull();

		await reveal("Content 20");

		expect(rowNamed("Content 20")).not.toBeNull();
		await waitFor(() => {
			expect(rowNamed("Content 20")).toHaveFocus();
		});
	});
});

describe("SpecForm — read mode, reference tree with Attributes", () => {
	it("labels each Attribute with its Field's name", async () => {
		renderRead(
			{ related: [{ id: "article-1", attributes: { role: "Author" } }] },
			referenceField({
				blueprints: ["article"],
				attributes: [attribute("role", "Role")],
			}),
		);

		await screen.findByText("Cats of the world");
		expect(screen.getByText("Role")).toBeInTheDocument();
		expect(screen.getByText("Author")).toBeInTheDocument();
	});
});
