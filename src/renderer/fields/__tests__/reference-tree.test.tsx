import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { ReferenceSettings } from "../../../schema/field-types/reference";
import type { Reference } from "../../../schema/reference";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeReferenceAdapter,
	fakeCatalogue,
	fakeReferenceTree,
} from "../../../test/fake-reference-adapter";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";
import { REFERENCE_TREE_COLLAPSE_THRESHOLD } from "../reference-tree";

const ACCESSOR = "related";

const field: Field<ReferenceSettings> = {
	field_type: "reference",
	config: {
		name: "Related articles",
		api_accessor: ACCESSOR,
		required: false,
		instructions: "",
	},
	settings: { blueprints: ["article"] },
	children: null,
	system: false,
};

/** Reads the stored value straight from the form: a drag is only real if the
 * tree it produced is the tree that got stored. */
function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderTree({
	value,
	contents = fakeCatalogue(10),
	readOnly = false,
	settings,
}: {
	value: Reference[];
	contents?: ReturnType<typeof fakeCatalogue>;
	readOnly?: boolean;
	/** Merged over the Field's own — how a cap gets into a drag test. */
	settings?: ReferenceSettings;
}) {
	const capped: Field<ReferenceSettings> = {
		...field,
		settings: { ...field.settings, ...settings },
	};
	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([capped], builtInFieldTypes)),
			defaultValues: { [ACCESSOR]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider
					plugins={builtInFieldTypes}
					adapters={{ reference: createFakeReferenceAdapter({ contents }) }}
				>
					<FormProvider {...methods}>
						<form noValidate>
							<FieldComponent field={capped} readOnly={readOnly} />
							<StoredValue />
						</form>
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}
	return render(<Harness />);
}

/** The rows on screen, top to bottom, as `[name, depth]`. */
function renderedRows(): [string, number][] {
	return screen.queryAllByTestId("reference-row").map((row) => [
		// The resolved name is the row's only text: its buttons are icons with
		// aria-labels, and contribute no text node.
		row.textContent?.trim() ?? "",
		Number(row.getAttribute("data-depth")),
	]);
}

/**
 * jsdom lays nothing out — every rect is zeroes, so dnd-kit's keyboard
 * coordinate getter can never find a direction to move in. Fake a column: one
 * row per 60px, all the same width so a vertical step asks for no
 * indentation of its own. The editor's drag tests fake layout the same way.
 *
 * No `DragOverlay` here, so there is no overlay rect to pin — dnd-kit derives
 * the keyboard collision rect from the dragged node itself.
 */
function mockRowRects() {
	return vi
		.spyOn(Element.prototype, "getBoundingClientRect")
		.mockImplementation(function (this: Element) {
			const rows = Array.from(
				document.querySelectorAll('[data-testid="reference-row"]'),
			);
			const index = rows.indexOf(this);
			const top = index === -1 ? 0 : index * 60;
			return {
				top,
				bottom: top + 50,
				left: 0,
				right: 200,
				width: 200,
				height: 50,
				x: 0,
				y: top,
				toJSON() {
					return this;
				},
			} as DOMRect;
		});
}

/**
 * Drives a drag from the keyboard, which is the only kind jsdom supports —
 * real pointer drags need a layout engine. `codes` are pressed in order
 * between the lift and the release.
 */
async function keyboardDrag(name: string, ...codes: string[]) {
	const grip = screen.getByRole("button", { name: `Reorder ${name}` });
	grip.focus();
	fireEvent.keyDown(grip, { code: "Space" });
	// The KeyboardSensor attaches its document listener in a setTimeout after
	// activation — yield a macrotask before the first key.
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	for (const code of codes) {
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? grip, { code });
		});
	}
	await act(async () => {
		fireEvent.keyDown(document.activeElement ?? grip, { code: "Space" });
	});
}

describe("the Reference Tree's rows", () => {
	it("renders a nested Reference under its parent, at its own depth", async () => {
		renderTree({
			value: [
				{ id: "article-1", children: [{ id: "article-2" }] },
				{ id: "article-3" },
			],
		});

		await screen.findByText("Content 1");
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 1],
			["Content 3", 0],
		]);
	});

	it("removes a Reference's whole branch along with it", async () => {
		const user = userEvent.setup();
		renderTree({
			value: [
				{ id: "article-1", children: [{ id: "article-2" }] },
				{ id: "article-3" },
			],
		});

		await user.click(
			await screen.findByRole("button", { name: "Remove Content 1" }),
		);

		expect(stored()).toEqual([{ id: "article-3" }]);
	});
});

describe("collapsing a branch", () => {
	const value: Reference[] = [
		{
			id: "article-1",
			children: [{ id: "article-2", children: [{ id: "article-3" }] }],
		},
		{ id: "article-4" },
	];

	it("hides everything under the Reference, and brings it back", async () => {
		const user = userEvent.setup();
		renderTree({ value });

		await user.click(
			await screen.findByRole("button", { name: "Collapse Content 1" }),
		);
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 4", 0],
		]);

		await user.click(screen.getByRole("button", { name: "Expand Content 1" }));
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 1],
			["Content 3", 2],
			["Content 4", 0],
		]);
	});

	it("says whether a branch is open, and offers no toggle without one", async () => {
		renderTree({ value });

		expect(
			await screen.findByRole("button", { name: "Collapse Content 1" }),
		).toHaveAttribute("aria-expanded", "true");
		// Content 4 is a leaf: there is nothing under it to fold away, so it
		// gets no toggle at all rather than a dead one.
		expect(
			screen.queryByRole("button", { name: /^(Collapse|Expand) Content 4$/ }),
		).toBeNull();
	});

	it("leaves the stored value exactly as it was", async () => {
		const user = userEvent.setup();
		renderTree({ value });

		await user.click(
			await screen.findByRole("button", { name: "Collapse Content 1" }),
		);

		expect(stored()).toEqual(value);
	});
});

describe("how big a tree opens", () => {
	it("opens expanded at the threshold, so a small tree reads at once", async () => {
		const count = REFERENCE_TREE_COLLAPSE_THRESHOLD;
		renderTree({
			value: fakeReferenceTree(count),
			contents: fakeCatalogue(count),
		});

		await screen.findByText("Content 1");
		expect(screen.getAllByTestId("reference-row")).toHaveLength(count);
	});

	it("opens with its parents collapsed above the threshold", async () => {
		const count = REFERENCE_TREE_COLLAPSE_THRESHOLD + 2;
		renderTree({
			value: fakeReferenceTree(count),
			contents: fakeCatalogue(count),
		});

		await screen.findByText("Content 1");
		// Only the roots: every parent starts collapsed, so the tree is
		// navigable from the first render instead of needing to be scrolled.
		expect(screen.getAllByTestId("reference-row")).toHaveLength(count / 2);
		expect(
			screen.getByRole("button", { name: "Expand Content 1" }),
		).toHaveAttribute("aria-expanded", "false");
	});
});

describe("dragging, driven from the keyboard", () => {
	it("reorders a Reference among its siblings", async () => {
		const rects = mockRowRects();
		renderTree({ value: [{ id: "article-1" }, { id: "article-2" }] });
		await screen.findByText("Content 1");

		await keyboardDrag("Content 1", "ArrowDown");

		expect(stored()).toEqual([{ id: "article-2" }, { id: "article-1" }]);
		expect(renderedRows()).toEqual([
			["Content 2", 0],
			["Content 1", 0],
		]);
		rects.mockRestore();
	});

	it("nests a Reference under the one above it", async () => {
		const rects = mockRowRects();
		renderTree({ value: [{ id: "article-1" }, { id: "article-2" }] });
		await screen.findByText("Content 1");

		// One level of indentation to the right, no vertical travel: the
		// Reference stays where it is and becomes a child of its predecessor.
		await keyboardDrag("Content 2", "ArrowRight");

		expect(stored()).toEqual([
			{ id: "article-1", children: [{ id: "article-2" }] },
		]);
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 1],
		]);
		rects.mockRestore();
	});

	it("nests a Reference dragged onto another one further down", async () => {
		const rects = mockRowRects();
		renderTree({
			value: [{ id: "article-1" }, { id: "article-2" }, { id: "article-3" }],
		});
		await screen.findByText("Content 1");

		await keyboardDrag("Content 1", "ArrowDown", "ArrowRight");

		expect(stored()).toEqual([
			{ id: "article-2", children: [{ id: "article-1" }] },
			{ id: "article-3" },
		]);
		rects.mockRestore();
	});

	it("takes a Reference's descendants with it, subtree intact", async () => {
		const rects = mockRowRects();
		renderTree({
			value: [
				{
					id: "article-1",
					children: [{ id: "article-2", children: [{ id: "article-3" }] }],
				},
				{ id: "article-4" },
			],
		});
		await screen.findByText("Content 1");

		// Three rows down clears the branch's own rows and lands under
		// Content 4 — the only place outside the branch there is to go.
		await keyboardDrag("Content 1", "ArrowDown", "ArrowDown", "ArrowDown");

		expect(stored()).toEqual([
			{ id: "article-4" },
			{
				id: "article-1",
				children: [{ id: "article-2", children: [{ id: "article-3" }] }],
			},
		]);
		rects.mockRestore();
	});

	it("takes a collapsed Reference's hidden branch with it too", async () => {
		const user = userEvent.setup();
		renderTree({
			value: [
				{ id: "article-1", children: [{ id: "article-2" }] },
				{ id: "article-3" },
			],
		});
		await user.click(
			await screen.findByRole("button", { name: "Collapse Content 1" }),
		);
		const rects = mockRowRects();

		await keyboardDrag("Content 1", "ArrowDown");

		expect(stored()).toEqual([
			{ id: "article-3" },
			{ id: "article-1", children: [{ id: "article-2" }] },
		]);
		// And it is still collapsed where it landed: a drag must not spring
		// the tree open.
		expect(
			screen.getByRole("button", { name: "Expand Content 1" }),
		).toBeInTheDocument();
		rects.mockRestore();
	});

	it("cannot reach a depth inside a folded branch", async () => {
		const user = userEvent.setup();
		renderTree({
			value: [
				{ id: "article-3" },
				{ id: "article-1", children: [{ id: "article-2" }] },
				{ id: "article-4" },
			],
		});
		await user.click(
			await screen.findByRole("button", { name: "Collapse Content 1" }),
		);
		const rects = mockRowRects();

		// Two levels of indentation asked for, below a folded Reference: the
		// deepest thing on offer is being its child, never its hidden child's.
		await keyboardDrag("Content 3", "ArrowDown", "ArrowRight", "ArrowRight");

		expect(stored()).toEqual([
			{ id: "article-1", children: [{ id: "article-2" }, { id: "article-3" }] },
			{ id: "article-4" },
		]);
		// And what it landed in is unfolded, so it can be seen where it went.
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 1],
			["Content 3", 1],
			["Content 4", 0],
		]);
		rects.mockRestore();
	});

	it("keeps a stored entry that is not a Reference where it was", async () => {
		const rects = mockRowRects();
		renderTree({
			value: [
				"not-a-reference",
				{ id: "article-1" },
				{ id: "article-2" },
			] as unknown as Reference[],
		});
		await screen.findByText("Content 1");

		await keyboardDrag("Content 1", "ArrowDown");

		// The stray renders no row, so nothing an Author did asked for it to go.
		expect(stored()).toEqual([
			"not-a-reference",
			{ id: "article-2" },
			{ id: "article-1" },
		]);
		rects.mockRestore();
	});

	it("leaves the stored value alone when the drag ends where it began", async () => {
		const rects = mockRowRects();
		const value = [{ id: "article-1" }, { id: "article-2" }];
		renderTree({ value });
		await screen.findByText("Content 1");

		await keyboardDrag("Content 1");

		expect(stored()).toEqual(value);
		rects.mockRestore();
	});

	it("offers no grip at all in read-only mode", async () => {
		renderTree({ value: [{ id: "article-1" }], readOnly: true });

		await screen.findByText("Content 1");
		expect(screen.queryByRole("button", { name: /^Reorder/ })).toBeNull();
	});
});

describe("dragging against the max_depth cap", () => {
	it("clamps a drop that would nest, at max_depth 1, rather than accepting it", async () => {
		const rects = mockRowRects();
		// One level of References is a flat list: `max_depth` counts levels,
		// roots being the first, so 1 forbids nesting altogether.
		renderTree({
			value: [{ id: "article-1" }, { id: "article-2" }],
			settings: { max_depth: 1 },
		});
		await screen.findByText("Content 1");

		await keyboardDrag("Content 2", "ArrowRight");

		// The same drag nests without a cap — see "nests a Reference under the
		// one above it" above. Clamped, not refused: the drop still happened.
		expect(stored()).toEqual([{ id: "article-1" }, { id: "article-2" }]);
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 0],
		]);
		rects.mockRestore();
	});

	it("clamps to the deepest level the cap leaves, not to the root", async () => {
		const rects = mockRowRects();
		renderTree({
			value: [
				{ id: "article-1", children: [{ id: "article-2" }] },
				{ id: "article-3" },
			],
			settings: { max_depth: 2 },
		});
		await screen.findByText("Content 1");

		// Two levels of indentation asked for, two allowed in total: Content 3
		// becomes Content 2's sibling rather than its child.
		await keyboardDrag("Content 3", "ArrowRight", "ArrowRight");

		expect(stored()).toEqual([
			{
				id: "article-1",
				children: [{ id: "article-2" }, { id: "article-3" }],
			},
		]);
		rects.mockRestore();
	});

	it("nests as deep as the neighbours allow when max_depth is unset", async () => {
		const rects = mockRowRects();
		renderTree({
			value: [
				{ id: "article-1", children: [{ id: "article-2" }] },
				{ id: "article-3" },
			],
		});
		await screen.findByText("Content 1");

		await keyboardDrag("Content 3", "ArrowRight", "ArrowRight");

		// The very drag the cap clamped above, uncapped: an unset ceiling is no
		// ceiling, not a ceiling of zero.
		expect(stored()).toEqual([
			{
				id: "article-1",
				children: [{ id: "article-2", children: [{ id: "article-3" }] }],
			},
		]);
		rects.mockRestore();
	});
});

describe("what a drag stores", () => {
	it("keeps a nested tree through submit rather than flattening it", async () => {
		// The Field's Schema is recursive (ADR-0008): a Zod object that did not
		// name `children` would strip a branch on parse, so a drop would nest on
		// screen and submit a flat list.
		const schema = specToZodSchema([field], builtInFieldTypes);
		const tree = {
			[ACCESSOR]: [
				{ id: "article-1", children: [{ id: "article-2" }] },
				{ id: "article-3" },
			],
		};

		expect(schema.parse(tree)).toEqual(tree);
	});
});

describe("read-only trees", () => {
	it("can still be collapsed, because that is a way of reading", async () => {
		const user = userEvent.setup();
		renderTree({
			value: [{ id: "article-1", children: [{ id: "article-2" }] }],
			readOnly: true,
		});

		await user.click(
			await screen.findByRole("button", { name: "Collapse Content 1" }),
		);

		expect(renderedRows()).toEqual([["Content 1", 0]]);
	});
});

describe("a tree whose stored value is not all References", () => {
	it("renders the rows it can and removes by stored position", async () => {
		const user = userEvent.setup();
		renderTree({
			value: [
				"not-a-reference",
				{ id: "article-1", children: ["nor-this", { id: "article-2" }] },
			] as unknown as Reference[],
		});

		await screen.findByText("Content 1");
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 1],
		]);

		await user.click(screen.getByRole("button", { name: "Remove Content 2" }));

		expect(stored()).toEqual([
			"not-a-reference",
			{ id: "article-1", children: ["nor-this"] },
		]);
	});
});
