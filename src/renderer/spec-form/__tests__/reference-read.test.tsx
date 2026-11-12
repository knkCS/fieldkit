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

const specField = (accessor: string, name: string): Field => ({
	field_type: "text",
	config: { name, api_accessor: accessor, required: false, instructions: "" },
	settings: null,
	children: null,
	system: false,
});

/** The Blueprints every Field here points at. */
const ARTICLE = [{ blueprint: "article" }];

/** A Field whose Reference Spec holds one Field — the case most of these
 * tests want. */
const WITH_PAGE: ReferenceSettings = {
	blueprints: ARTICLE,
	spec: [specField("page", "Page")],
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
		renderRead({
			related: [
				{ _id: "r1", id: "article-1" },
				{ _id: "r2", id: "article-2" },
			],
		});

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Dogs of the world")).toBeInTheDocument();
		// The table cell's answer — a count — must not be what read mode shows.
		expect(screen.queryByText("2 references")).not.toBeInTheDocument();
	});

	it("resolves each Content's current name through the Adapter", async () => {
		const adapter = createFakeReferenceAdapter();
		adapter.rename("article-1", "Cats of the whole world");

		renderRead(
			{ related: [{ _id: "r1", id: "article-1" }] },
			referenceField(),
			adapter,
		);

		expect(
			await screen.findByText("Cats of the whole world"),
		).toBeInTheDocument();
	});

	it("keeps the id of a Content it cannot resolve on screen", async () => {
		renderRead({ related: [{ _id: "r1", id: "deleted-42" }] });

		expect(await screen.findByText("deleted-42")).toBeInTheDocument();
	});

	it("makes the nesting visible", async () => {
		renderRead({
			related: [
				{
					_id: "r1",
					id: "article-1",
					children: [
						{
							_id: "r2",
							id: "article-2",
							children: [{ _id: "r3", id: "article-3" }],
						},
					],
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
			related: [
				{
					_id: "r1",
					id: "article-1",
					children: [{ _id: "r2", id: "author-1" }],
				},
			],
		});

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
	});

	it("shows each Reference's values against it", async () => {
		renderRead({
			related: [
				{ _id: "r1", id: "article-1", values: { page: "12" } },
				{ _id: "r2", id: "article-2", values: { page: "88" } },
			],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-read-row");
		expect(rows[0]).toHaveTextContent("Page");
		expect(rows[0]).toHaveTextContent("12");
		expect(rows[1]).toHaveTextContent("88");
		// Each value sits under the Reference it belongs to, not pooled.
		expect(rows[0]).not.toHaveTextContent("88");
		expect(within(rows[0]).getAllByTestId("reference-read-value")).toHaveLength(
			1,
		);
	});

	it("shows a nested Reference's values on the nested Reference", async () => {
		renderRead({
			related: [
				{
					_id: "r1",
					id: "article-1",
					values: { page: "12" },
					children: [{ _id: "r2", id: "article-2", values: { page: "88" } }],
				},
			],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-read-row");
		expect(rows[1]).toHaveTextContent("Dogs of the world");
		expect(rows[1]).toHaveTextContent("88");
	});

	it("renders an em dash for a value nobody filled in", async () => {
		renderRead({ related: [{ _id: "r1", id: "article-1" }] });

		await screen.findByText("Cats of the world");
		expect(screen.getByTestId("reference-read-row")).toHaveTextContent("—");
	});

	it("renders no value rows when the Reference Spec is empty", async () => {
		renderRead(
			{ related: [{ _id: "r1", id: "article-1", values: { page: "12" } }] },
			referenceField({ blueprints: ARTICLE }),
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
			{ related: [{ _id: "r1", id: "article-1" }] },
			referenceField({ blueprints: ARTICLE }, "toc_reference"),
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
			related: [
				{
					_id: "r1",
					id: "article-1",
					children: [{ _id: "r2", id: "article-2" }],
				},
			],
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
		renderRead({ related: [{ _id: "r1", id: "article-1" }] });

		await screen.findByText("Cats of the world");
		// A control claiming to collapse a leaf would claim it hides something.
		expect(
			screen.queryByRole("button", { name: /Cats of the world/ }),
		).not.toBeInTheDocument();
	});

	it("keeps a fold out of the value it was handed", async () => {
		const value = [
			{
				_id: "r1",
				id: "article-1",
				children: [{ _id: "r2", id: "article-2" }],
			},
		];
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
 * Find in read mode (#153, contenthub #642) — anker's icon search in the
 * label row, the same control the editable tree carries, over the same
 * functions.
 *
 * What a query matches is asserted in `src/schema/__tests__/reference-find.test.ts`.
 * What is left for here is the wiring: that the control is in the label row on
 * every non-empty tree, that it opens with focus in it (by click or by `/`
 * while the Field has focus), that typing opens the way down to a match and
 * marks it without taking focus from the input, that the counter steps
 * through the matches, and that none of it writes.
 */
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

/** Types a query into Find; the debounce is waited out by whatever the
 * caller then waits for. */
async function search(query: string): Promise<HTMLElement> {
	const input = await openSearch();
	fireEvent.change(input, { target: { value: query } });
	return input;
}

/** What the counter says, once it says `expected`. */
async function expectCount(expected: string) {
	await waitFor(() => {
		expect(screen.getByTestId("reference-find-count")).toHaveTextContent(
			expected,
		);
	});
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

/** Searches for `name`, which matches it alone, and waits for the Reveal. */
async function reveal(name: string) {
	await search(name);
	await waitFor(() => {
		expect(rowNamed(name)).toHaveAttribute("data-revealed", "true");
	});
}

/** The label row's actions: the right end of the row naming the Field. */
function readLabelActions(): HTMLElement {
	const group = screen.getByRole("group", { name: /^Related articles/ });
	const actions = group.querySelector<HTMLElement>(
		"[data-field-label-actions]",
	);
	if (!actions) throw new Error("no label row actions");
	return actions;
}

describe("SpecForm — read mode, Find", () => {
	describe.each([
		3,
		REFERENCE_TREE_COLLAPSE_THRESHOLD + 5,
	])("on a tree of %i References", (size) => {
		it("offers a named search icon in the label row, before Expand all and Collapse all", async () => {
			renderReadTree(size);
			await screen.findByText("Content 1");

			const buttons = within(readLabelActions()).getAllByRole("button");
			expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
				FIND,
				"Expand all",
				"Collapse all",
			]);
			// Resting as an icon: no input until it is asked for.
			expect(searchInput()).not.toBeInTheDocument();
		});

		it("opens with focus in the input on a click", async () => {
			renderReadTree(size);
			await screen.findByText("Content 1");

			const input = await openSearch();

			await waitFor(() => {
				expect(input).toHaveFocus();
			});
		});
	});

	it("offers none on an empty value", () => {
		renderRead({ related: [] });

		expect(searchButton()).not.toBeInTheDocument();
	});

	it("draws no separate Find control any more", async () => {
		renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
		await screen.findByText("Content 1");

		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});

	describe("the / key", () => {
		it("opens the search while the Field has focus", async () => {
			renderReadTree(3);
			await screen.findByText("Content 1");
			const fold = screen.getByRole("button", { name: "Collapse Content 1" });
			fold.focus();

			fireEvent.keyDown(fold, { key: "/" });

			const input = await screen.findByRole("searchbox", { name: FIND });
			await waitFor(() => {
				expect(input).toHaveFocus();
			});
		});

		it("opens it from the label row's own controls too", async () => {
			renderReadTree(3);
			await screen.findByText("Content 1");
			const expand = screen.getByRole("button", { name: "Expand all" });
			expand.focus();

			fireEvent.keyDown(expand, { key: "/" });

			expect(
				await screen.findByRole("searchbox", { name: FIND }),
			).toBeInTheDocument();
		});

		it("does nothing from outside the Field", async () => {
			renderReadTree(3);
			await screen.findByText("Content 1");

			fireEvent.keyDown(document.body, { key: "/" });

			expect(searchInput()).not.toBeInTheDocument();
		});
	});

	describe("what typing does", () => {
		it("opens the way down to a match in a folded branch and marks it, keeping focus in the input", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");
			// Not on screen at all — which is the problem Find exists for.
			expect(rowNamed("Content 20")).toBeNull();

			const input = await search("Content 20");

			await waitFor(() => {
				expect(rowNamed("Content 20")).toHaveAttribute("data-revealed", "true");
			});
			expect(
				screen.getByRole("button", { name: "Collapse Content 19" }),
			).toHaveAttribute("aria-expanded", "true");
			await expectCount("1 of 1");
			// The Author is still typing: the Reveal scrolls, it never takes
			// focus out of the input.
			expect(input).toHaveFocus();
		});

		it("counts the matches and steps through them in tree order, both ways", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			// "Content 2" answers Content 2 (under 1), 20 (under 19) and 21.
			await search("Content 2");
			await expectCount("1 of 3");
			await waitFor(() => {
				expect(rowNamed("Content 2")).toHaveAttribute("data-revealed", "true");
			});

			fireEvent.click(screen.getByRole("button", { name: "Next match" }));
			await expectCount("2 of 3");
			await waitFor(() => {
				expect(rowNamed("Content 20")).toHaveAttribute("data-revealed", "true");
			});
			expect(rowNamed("Content 2")).not.toHaveAttribute("data-revealed");

			fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
			await expectCount("1 of 3");

			// And round the end, the way find-in-page wraps.
			fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
			await expectCount("3 of 3");
			await waitFor(() => {
				expect(rowNamed("Content 21")).toHaveAttribute("data-revealed", "true");
			});
		});

		it("steps on Enter and back on Shift+Enter", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			const input = await search("Content 2");
			await expectCount("1 of 3");

			fireEvent.keyDown(input, { key: "Enter" });
			await expectCount("2 of 3");
			fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
			await expectCount("1 of 3");
		});

		it("says so when nothing matches", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await search("Pyrenees");

			await expectCount("No matches");
			expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled();
		});

		it("announces the Reveal, for an Author who is not watching the tree", async () => {
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await reveal("Content 20");

			expect(
				screen.getByTestId("reference-read-reveal-notice"),
			).toHaveTextContent("Revealed Content 20");
			expect(screen.getByTestId("reference-find-count")).toHaveAttribute(
				"role",
				"status",
			);
		});

		it("scrolls the match to the centre of the viewport", async () => {
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

		it("leaves an earlier match's folds open", async () => {
			// A Reveal is an answer, not a preview: it does not fold back.
			renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
			await screen.findByText("Content 1");

			await reveal("Content 20");
			await reveal("Content 4");

			expect(rowNamed("Content 4")).not.toBeNull();
			expect(rowNamed("Content 20")).not.toBeNull();
		});
	});

	describe("closing", () => {
		it("empties and closes on Escape, focus back on the icon", async () => {
			renderReadTree(3);
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
			await waitFor(() => {
				expect(searchButton()).toHaveFocus();
			});
			// Opened again, it is empty.
			expect(await openSearch()).toHaveValue("");
		});

		it("keeps a query on blur, and closes an empty search", async () => {
			renderReadTree(3);
			await screen.findByText("Content 1");
			const input = await search("Content 2");
			await expectCount("1 of 1");

			act(() => {
				screen.getByRole("button", { name: "Expand all" }).focus();
			});
			expect(searchInput()).toHaveValue("Content 2");

			fireEvent.change(input, { target: { value: "" } });
			act(() => {
				input.focus();
			});
			act(() => {
				screen.getByRole("button", { name: "Expand all" }).focus();
			});
			await waitFor(() => {
				expect(searchInput()).not.toBeInTheDocument();
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
	});

	it("still finds by id with no Adapter configured at all", async () => {
		// Read mode draws the tree whatever resolves, so the screen here is the
		// *same* screen a failed lookup leaves behind — every row showing its id.
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
	});

	it("says the names are still arriving rather than that nothing matched, and answers once they land", async () => {
		// The third Find state reaches read mode too (#152): a control that
		// answered "no" before it knew would be believed.
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
		const adapter = createFakeReferenceAdapter({
			contents: fakeCatalogue(size),
			holdFetch: true,
		});
		renderRead({ related: fakeReferenceTree(size) }, referenceField(), adapter);
		await screen.findByText("article-1");

		await search("Content 20");
		await expectCount("Resolving names…");

		await act(async () => {
			adapter.releaseFetches();
		});

		// The same query answers as soon as they land, unretyped.
		await expectCount("1 of 1");
		await waitFor(() => {
			expect(rowNamed("Content 20")).toHaveAttribute("data-revealed", "true");
		});
	});
});

/**
 * Expand all and Collapse all in read mode (#150, contenthub #641).
 *
 * Every non-empty tree carries both, at any size, as icon buttons at the right
 * end of the Field's label row — the controls are the editable tree's, placed
 * there by the label row rather than by this renderer.
 */
describe("SpecForm — read mode, Expand all and Collapse all", () => {
	/** The label row's actions: the right end of the row naming the Field. */
	function labelActions(): HTMLElement {
		const group = screen.getByRole("group", { name: /^Related articles/ });
		const actions = group.querySelector<HTMLElement>(
			"[data-field-label-actions]",
		);
		if (!actions) throw new Error("no label row actions");
		return actions;
	}

	describe.each([
		3,
		REFERENCE_TREE_COLLAPSE_THRESHOLD - 1,
		REFERENCE_TREE_COLLAPSE_THRESHOLD,
		REFERENCE_TREE_COLLAPSE_THRESHOLD + 5,
	])("on a tree of %i References", (size) => {
		it("offers both, named, in the label row", async () => {
			renderReadTree(size);
			await screen.findByText("Content 1");

			const actions = labelActions();
			expect(
				within(actions).getByRole("button", { name: "Expand all" }),
			).toBeInTheDocument();
			expect(
				within(actions).getByRole("button", { name: "Collapse all" }),
			).toBeInTheDocument();
		});

		it("counts every Reference at every level in the label", async () => {
			renderReadTree(size);
			await screen.findByText("Content 1");

			expect(
				screen.getByRole("group", { name: `Related articles · ${size}` }),
			).toBeInTheDocument();
		});

		it("folds every branch to the top level, and opens every branch", async () => {
			renderReadTree(size);
			await screen.findByText("Content 1");
			const roots = readReferenceTree(fakeReferenceTree(size)).filter(
				(row) => row.depth === 0,
			).length;

			fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
			expect(screen.getAllByTestId("reference-read-row")).toHaveLength(roots);

			fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
			expect(screen.getAllByTestId("reference-read-row")).toHaveLength(size);

			// A fold still toggles on its own afterwards.
			fireEvent.click(
				screen.getByRole("button", { name: "Collapse Content 1" }),
			);
			expect(screen.getAllByTestId("reference-read-row")).toHaveLength(
				size - 1,
			);
			fireEvent.click(screen.getByRole("button", { name: "Expand Content 1" }));
			expect(screen.getAllByTestId("reference-read-row")).toHaveLength(size);
		});
	});

	it("offers neither, and no count, on an empty Field", () => {
		renderRead({ related: [] });

		expect(
			screen.queryByRole("button", { name: "Expand all" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Collapse all" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("group", { name: "Related articles" }),
		).toBeInTheDocument();
	});

	it("keeps a nested Field's controls out of its container's label row", async () => {
		// A Reference Field inside a Group is rendered by the Group's read
		// component: its buttons belong to it, not to the Group's label.
		const group: Field = {
			field_type: "group",
			config: {
				name: "Sources",
				api_accessor: "sources",
				required: false,
				instructions: "",
			},
			settings: null,
			children: [referenceField() as Field],
			system: false,
		};
		render(
			<Provider>
				<FieldKitProvider
					plugins={builtInFieldTypes}
					adapters={{ reference: createFakeReferenceAdapter() }}
				>
					<SpecForm
						schema={[group]}
						mode="read"
						values={{
							sources: [
								{
									_id: "g1",
									related: [
										{
											_id: "r1",
											id: "article-1",
											children: [{ _id: "r2", id: "article-2" }],
										},
									],
								},
							],
						}}
					/>
				</FieldKitProvider>
			</Provider>,
		);
		await screen.findByText("Cats of the world");

		const sources = screen.getByRole("group", { name: "Sources" });
		const row = sources.querySelector("[data-field-label-actions]");
		expect(row?.childElementCount ?? 0).toBe(0);
		// Still there, beside the nested tree rather than lost.
		expect(
			screen.getByRole("button", { name: "Collapse all" }),
		).toBeInTheDocument();
	});

	it("still returns a tree past the threshold to the rows it opened with", async () => {
		const size = REFERENCE_TREE_COLLAPSE_THRESHOLD + 1;
		renderReadTree(size);
		await screen.findByText("Content 1");
		const opened = readNames();
		const rows = readReferenceTree(fakeReferenceTree(size));
		expect(opened).toEqual(
			visibleReferenceRows(rows, initialReferenceFolds(rows)).map((row) =>
				referenceDisplayName(row, catalogueNames(size)),
			),
		);

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
		fireEvent.click(screen.getByRole("button", { name: "Expand all" }));

		expect(value).toEqual(before);
	});

	it("leaves a Reveal after it opening the way down as normal", async () => {
		renderReadTree(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1);
		await screen.findByText("Content 1");
		await reveal("Content 20");

		fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(rowNamed("Content 20")).toBeNull();

		// Stepping to the match again — the only one, so "next" is itself —
		// opens the way back down.
		fireEvent.click(screen.getByRole("button", { name: "Next match" }));

		await waitFor(() => {
			expect(rowNamed("Content 20")).not.toBeNull();
		});
	});
});

describe("SpecForm — read mode, reference tree with a Reference Spec", () => {
	it("labels each value with its Field's name", async () => {
		renderRead(
			{ related: [{ _id: "r1", id: "article-1", values: { role: "Author" } }] },
			referenceField({
				blueprints: ARTICLE,
				spec: [specField("role", "Role")],
			}),
		);

		await screen.findByText("Cats of the world");
		expect(screen.getByText("Role")).toBeInTheDocument();
		expect(screen.getByText("Author")).toBeInTheDocument();
		expect(screen.getByTestId("reference-read-value")).toHaveTextContent(
			"Author",
		);
	});
});
