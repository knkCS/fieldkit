// A Reference tree's controls in its Field's label row, through SpecForm in
// edit and read mode alike (contenthub #641): Expand all and Collapse all on
// every non-empty tree at any size, the label counting every Reference, and
// the collapse threshold deciding only how a tree opens — and Find, anker's
// icon search, first among them (contenthub #642).
import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import { REFERENCE_TREE_COLLAPSE_THRESHOLD } from "../../../schema/reference-tree";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeReferenceAdapter,
	fakeCatalogue,
	fakeReferenceTree,
} from "../../../test/fake-reference-adapter";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const related: Field = {
	field_type: "reference",
	config: {
		name: "Related articles",
		api_accessor: "related",
		required: false,
		instructions: "",
	},
	settings: { blueprints: [{ blueprint: "article" }] },
	system: false,
};

const title: Field = {
	field_type: "text",
	config: {
		name: "Title",
		api_accessor: "title",
		required: false,
		instructions: "",
	},
	settings: null,
	system: false,
};

const spec = [title, related];

function EditHarness({ value }: { value: unknown }) {
	const methods = useForm({
		resolver: zodResolver(specToZodSchema(spec, builtInFieldTypes)),
		defaultValues: { related: value, title: "" },
	});
	return (
		<FormProvider {...methods}>
			<SpecForm schema={spec} />
		</FormProvider>
	);
}

function renderTree(mode: "edit" | "read", size: number) {
	const value = size === 0 ? [] : fakeReferenceTree(size);
	return render(
		<Provider>
			<FieldKitProvider
				plugins={builtInFieldTypes}
				adapters={{
					reference: createFakeReferenceAdapter({
						contents: fakeCatalogue(Math.max(size, 1)),
					}),
				}}
			>
				{mode === "edit" ? (
					<EditHarness value={value} />
				) : (
					<SpecForm schema={spec} mode="read" values={{ related: value }} />
				)}
			</FieldKitProvider>
		</Provider>,
	);
}

/** The label row's actions — the node at its right end — of the row whose
 * label reads `label`. */
function actionsBeside(label: string): HTMLElement {
	// The label's next sibling: the row is the label, then its actions.
	const actions = screen.getByText(label).nextElementSibling;
	if (
		!(actions instanceof HTMLElement) ||
		!actions.matches("[data-field-label-actions]")
	) {
		throw new Error(`no label row actions beside "${label}"`);
	}
	return actions;
}

/** How many tree rows are on screen, whichever renderer draws them. */
function rowCount(mode: "edit" | "read"): number {
	return screen.queryAllByTestId(
		mode === "edit" ? "reference-row" : "reference-read-row",
	).length;
}

describe.each([
	"edit",
	"read",
] as const)("SpecForm %s mode — a Reference tree's label row", (mode) => {
	it.each([
		3, 25,
	])("names Expand all and Collapse all in the label row of a tree of %i, and counts it", async (size) => {
		renderTree(mode, size);
		await screen.findByText("Content 1");

		const actions = actionsBeside(`Related articles · ${size}`);
		expect(
			within(actions).getByRole("button", { name: "Expand all" }),
		).toBeInTheDocument();
		expect(
			within(actions).getByRole("button", { name: "Collapse all" }),
		).toBeInTheDocument();
	});

	it("shows neither, and no count, on an empty Field", () => {
		renderTree(mode, 0);

		expect(screen.getByText("Related articles")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Expand all" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Collapse all" }),
		).not.toBeInTheDocument();
	});

	it("gives a Field without actions an empty label row", async () => {
		renderTree(mode, 3);
		await screen.findByText("Content 1");

		// The text Field's row has nothing at its right end; only the
		// Reference Field's carries buttons: Find, Expand all, Collapse all.
		expect(
			document.querySelectorAll("[data-field-label-actions] button"),
		).toHaveLength(3);
	});

	it("folds every branch to the top level, opens every branch, and leaves folds toggling", async () => {
		renderTree(mode, 6);
		await screen.findByText("Content 1");
		expect(rowCount(mode)).toBe(6);

		fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(rowCount(mode)).toBe(3);

		fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
		expect(rowCount(mode)).toBe(6);

		fireEvent.click(screen.getByRole("button", { name: "Collapse Content 3" }));
		expect(rowCount(mode)).toBe(5);
		fireEvent.click(screen.getByRole("button", { name: "Expand Content 3" }));
		expect(rowCount(mode)).toBe(6);
	});

	it("opens expanded at the threshold and folded past it", async () => {
		const { unmount } = renderTree(mode, REFERENCE_TREE_COLLAPSE_THRESHOLD);
		await screen.findByText("Content 1");
		expect(rowCount(mode)).toBe(REFERENCE_TREE_COLLAPSE_THRESHOLD);
		unmount();

		renderTree(mode, REFERENCE_TREE_COLLAPSE_THRESHOLD + 2);
		await screen.findByText("Content 1");
		expect(rowCount(mode)).toBe((REFERENCE_TREE_COLLAPSE_THRESHOLD + 2) / 2);
	});
});

const FIND = "Find a Reference";

/** The row on screen showing `name`, whichever renderer draws it. */
function rowNamed(mode: "edit" | "read", name: string): HTMLElement | null {
	return (
		screen
			.queryAllByTestId(
				mode === "edit" ? "reference-row" : "reference-read-row",
			)
			.find((row) => within(row).queryByText(name) !== null) ?? null
	);
}

async function expectCount(expected: string) {
	await waitFor(() => {
		expect(screen.getByTestId("reference-find-count")).toHaveTextContent(
			expected,
		);
	});
}

describe.each([
	"edit",
	"read",
] as const)("SpecForm %s mode — searching a Reference tree", (mode) => {
	it.each([
		3, 25,
	])("names a search icon in the label row of a tree of %i, beside Expand all and Collapse all", async (size) => {
		renderTree(mode, size);
		await screen.findByText("Content 1");

		const actions = actionsBeside(`Related articles · ${size}`);
		expect(
			within(actions)
				.getAllByRole("button")
				.map((b) => b.getAttribute("aria-label")),
		).toEqual([FIND, "Expand all", "Collapse all"]);
		// The old Find, a standing combobox, is gone.
		expect(screen.queryByRole("combobox", { name: FIND })).toBeNull();
	});

	it("opens with focus in the input on a click", async () => {
		renderTree(mode, 3);
		await screen.findByText("Content 1");

		fireEvent.click(screen.getByRole("button", { name: FIND }));

		const input = await screen.findByRole("searchbox", { name: FIND });
		await waitFor(() => {
			expect(input).toHaveFocus();
		});
	});

	it("opens on / while the Field has focus", async () => {
		renderTree(mode, 3);
		await screen.findByText("Content 1");
		const fold = screen.getByRole("button", { name: "Collapse Content 1" });
		fold.focus();

		fireEvent.keyDown(fold, { key: "/" });

		const input = await screen.findByRole("searchbox", { name: FIND });
		await waitFor(() => {
			expect(input).toHaveFocus();
		});
	});

	it("reveals a match inside a folded branch, counts and steps through the matches", async () => {
		renderTree(mode, 25);
		await screen.findByText("Content 1");
		expect(rowNamed(mode, "Content 20")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: FIND }));
		const input = await screen.findByRole("searchbox", { name: FIND });
		fireEvent.change(input, { target: { value: "Content 20" } });

		await waitFor(() => {
			expect(rowNamed(mode, "Content 20")).toHaveAttribute(
				"data-revealed",
				"true",
			);
		});
		await expectCount("1 of 1");

		// "Content 2" answers 2, 20 … 25 — seven, in tree order.
		fireEvent.change(input, { target: { value: "Content 2" } });
		await expectCount("1 of 7");
		fireEvent.click(screen.getByRole("button", { name: "Next match" }));
		await expectCount("2 of 7");
		await waitFor(() => {
			expect(rowNamed(mode, "Content 20")).toHaveAttribute(
				"data-revealed",
				"true",
			);
		});
		fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
		await expectCount("1 of 7");
	});

	it("clears and closes on Escape, and keeps a query on blur", async () => {
		renderTree(mode, 3);
		await screen.findByText("Content 1");
		fireEvent.click(screen.getByRole("button", { name: FIND }));
		const input = await screen.findByRole("searchbox", { name: FIND });
		fireEvent.change(input, { target: { value: "Content 2" } });
		await expectCount("1 of 1");

		act(() => {
			screen.getByRole("button", { name: "Expand all" }).focus();
		});
		expect(screen.getByRole("searchbox", { name: FIND })).toHaveValue(
			"Content 2",
		);

		act(() => {
			input.focus();
		});
		fireEvent.keyDown(input, { key: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("searchbox", { name: FIND })).toBeNull();
		});
	});
});
