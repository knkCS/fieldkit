import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
} from "../../../test/fake-reference-adapter";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";
import { INDENT_WIDTH } from "../reference-tree";

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

/** Reads the stored value straight from the form: an insert is only real if
 * the tree it produced is the tree that got stored. */
function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderTree({
	value,
	readOnly = false,
	settings,
}: {
	value: Reference[];
	readOnly?: boolean;
	/** Merged over the Field's own — how a cap gets into an insert test. */
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
					adapters={{
						reference: createFakeReferenceAdapter({
							contents: fakeCatalogue(8),
						}),
					}}
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
	return screen
		.queryAllByTestId("reference-row")
		.map((row) => [
			row.textContent?.trim() ?? "",
			Number(row.getAttribute("data-depth")),
		]);
}

function strips(): HTMLElement[] {
	return screen.queryAllByTestId("reference-insert-strip");
}

/**
 * Points at one strip, `levels` indent steps in from the tree's left edge.
 *
 * jsdom lays nothing out, so every rect is zeroes and `clientX` reads straight
 * through as the offset from the strip's own left edge — which is the tree's,
 * since a strip is never indented.
 */
function pointAt(slot: number, levels = 0): HTMLElement {
	const strip = strips()[slot];
	fireEvent.mouseMove(strip, { clientX: levels * INDENT_WIDTH });
	return strip;
}

/** What the strip says it will do, which is also its accessible name. */
function stripLabel(slot: number, levels = 0): string {
	return pointAt(slot, levels).getAttribute("aria-label") ?? "";
}

/** The depth the strip is offering — what a click would land at. */
function stripDepth(slot: number, levels = 0): number {
	return Number(pointAt(slot, levels).getAttribute("data-depth"));
}

/**
 * Clicks a strip where the pointer already is, and picks a Content from the
 * drawer it opens.
 *
 * `user.click` would move the pointer to the element's centre first, which in
 * jsdom — where every rect is zeroes — is the tree's left edge, so it would
 * throw away the depth the Author chose before pressing. A real browser moves
 * the pointer to where the click happens, which is where it already was.
 */
async function insertThrough(
	user: ReturnType<typeof userEvent.setup>,
	slot: number,
	levels: number,
	content: string,
) {
	fireEvent.click(pointAt(slot, levels));
	const picker = await screen.findByTestId("reference-picker");
	await user.click(await within(picker).findByText(content));
}

/**
 * jsdom lays nothing out, so dnd-kit's keyboard sensor can never find a
 * direction to move in. Fake a column, exactly as the drag tests next door do.
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

/** Lifts a row with the keyboard, which is the only drag jsdom supports. */
async function liftRow(name: string) {
	const grip = screen.getByRole("button", { name: `Reorder ${name}` });
	grip.focus();
	fireEvent.keyDown(grip, { code: "Space" });
	// The KeyboardSensor attaches its document listener in a setTimeout after
	// activation — yield a macrotask before asserting on the drag.
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

/** A tree of two roots, the first carrying two children. */
const branchedTree: Reference[] = [
	{ id: "article-1", children: [{ id: "article-2" }, { id: "article-3" }] },
	{ id: "article-4" },
];

describe("where the insertion strips sit", () => {
	it("puts one between every pair of rows, and one before the first", async () => {
		renderTree({ value: branchedTree });

		await screen.findByText("Content 1");
		// Four rows, so five positions — and the one at index 0 is the one
		// core's strip cannot reach.
		expect(strips()).toHaveLength(5);
		expect(strips().map((strip) => strip.getAttribute("data-slot"))).toEqual([
			"0",
			"1",
			"2",
			"3",
			"4",
		]);
	});

	it("offers none at all on an empty tree, where the Add control is the way in", () => {
		renderTree({ value: [] });

		expect(strips()).toHaveLength(0);
		expect(
			screen.getByRole("button", { name: "Add reference" }),
		).toBeInTheDocument();
	});

	it("offers none in read-only mode", async () => {
		renderTree({ value: branchedTree, readOnly: true });

		await screen.findByText("Content 1");
		expect(strips()).toHaveLength(0);
	});

	it("follows the rows on screen, so a folded branch costs its strips", async () => {
		const user = userEvent.setup();
		renderTree({ value: branchedTree });

		await user.click(
			await screen.findByRole("button", { name: "Collapse Content 1" }),
		);

		// Two rows left on screen, so three positions.
		expect(renderedRows()).toHaveLength(2);
		expect(strips()).toHaveLength(3);
	});
});

describe("the depth an insertion strip offers", () => {
	it("deepens by one level per indent step of pointer travel", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		// Between Content 3 and Content 4: the row above sits at depth 1, so a
		// child of it is depth 2 and everything shallower is on offer too.
		expect(stripDepth(3, 0)).toBe(0);
		expect(stripDepth(3, 1)).toBe(1);
		expect(stripDepth(3, 2)).toBe(2);
	});

	it("is clamped by the row above — nesting may not skip a level", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		// Content 1 is a root, so the deepest a Reference under it may land is
		// depth 1, however far right the pointer travels.
		expect(stripDepth(1, 5)).toBe(1);
	});

	it("is clamped by the row below, which sets the floor", async () => {
		renderTree({
			value: [
				{
					id: "article-1",
					children: [{ id: "article-2", children: [{ id: "article-3" }] }],
				},
			],
		});
		await screen.findByText("Content 1");

		// Between Content 2 (depth 1) and Content 3 (depth 2). Landing at depth
		// 1 adopts Content 3, which is the shallowest on offer — a root here
		// would adopt a branch nobody pointed at.
		expect(stripDepth(2, 0)).toBe(1);
		expect(stripDepth(2, 2)).toBe(2);
	});

	it("is clamped by max_depth", async () => {
		renderTree({
			// A tree well within a two-level cap, so the ceiling is the only
			// thing that can bind.
			value: [{ id: "article-1", children: [{ id: "article-2" }] }],
			settings: { blueprints: ["article"], max_depth: 2 },
		});
		await screen.findByText("Content 1");

		// The row above the last strip is Content 2 at depth 1, so its child
		// would be depth 2 — one past a cap of two levels.
		expect(stripDepth(2, 5)).toBe(1);
	});

	it("offers the deeper level once max_depth allows it", async () => {
		renderTree({
			value: [{ id: "article-1", children: [{ id: "article-2" }] }],
			settings: { blueprints: ["article"], max_depth: 3 },
		});
		await screen.findByText("Content 1");

		expect(stripDepth(2, 5)).toBe(2);
	});
});

describe("what an insertion strip says it will do", () => {
	it("names the Reference it would sit under, when it would nest", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		expect(stripLabel(1, 1)).toBe("Insert as a child of Content 1");
	});

	it("names the Reference it would sit beside, not that one's parent", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		// The defect this is written against: core's strip names the prospective
		// *parent* in both branches, so this slot would read "Content 1".
		expect(stripLabel(2, 1)).toBe("Insert as a sibling of Content 2");
	});

	it("names the sibling it would precede, before the first row", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		expect(stripLabel(0)).toBe("Insert as a sibling of Content 1");
	});

	it("says how many References it would adopt, alongside the relationship", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		// A root spliced between Content 1 and its children takes both of them.
		expect(stripLabel(1, 0)).toBe(
			"Insert as a sibling of Content 1, adopting 2 References",
		);
	});

	it("counts one adopted Reference in the singular", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		// Between the two children: depth 0 leaves Content 3 below it.
		expect(stripLabel(2, 0)).toBe(
			"Insert as a sibling of Content 1, adopting 1 Reference",
		);
	});

	it("says nothing about adoption when nothing would be adopted", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		expect(stripLabel(1, 1)).not.toMatch(/adopt/);
		expect(stripLabel(4, 0)).toBe("Insert as a sibling of Content 4");
	});

	it("shows the label and the depth it would land at while the pointer is on it", async () => {
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		// Nothing is announced until someone points at a strip.
		expect(screen.queryByTestId("reference-insert-label")).toBeNull();

		pointAt(1, 1);
		expect(screen.getByTestId("reference-insert-label")).toHaveTextContent(
			"Insert as a child of Content 1",
		);
		expect(screen.getByTestId("reference-insert-line")).toHaveAttribute(
			"data-depth",
			"1",
		);

		fireEvent.mouseLeave(strips()[1]);
		expect(screen.queryByTestId("reference-insert-label")).toBeNull();
	});
});

describe("inserting through a strip", () => {
	it("puts the Content at that position and depth", async () => {
		const user = userEvent.setup();
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		await insertThrough(user, 3, 1, "Content 5");

		expect(stored()).toEqual([
			{
				id: "article-1",
				children: [
					{ id: "article-2" },
					{ id: "article-3" },
					{ id: "article-5" },
				],
			},
			{ id: "article-4" },
		]);
	});

	it("adopts the trailing rows exactly as the strip announced", async () => {
		const user = userEvent.setup();
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		expect(stripLabel(1, 0)).toBe(
			"Insert as a sibling of Content 1, adopting 2 References",
		);
		await insertThrough(user, 1, 0, "Content 5");

		expect(stored()).toEqual([
			{ id: "article-1" },
			{
				id: "article-5",
				children: [{ id: "article-2" }, { id: "article-3" }],
			},
			{ id: "article-4" },
		]);
	});

	it("reaches the top of the tree, which core's strip cannot", async () => {
		const user = userEvent.setup();
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		await insertThrough(user, 0, 0, "Content 5");

		await screen.findByText("Content 5");
		expect(renderedRows()[0]).toEqual(["Content 5", 0]);
	});

	it("lands at the end of a folded Reference's branch, and unfolds it", async () => {
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
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 3", 0],
		]);

		// The strip between the folded Content 1 and Content 3, pointed one
		// level in: a child of Content 1.
		expect(stripLabel(1, 1)).toBe("Insert as a child of Content 1");
		await insertThrough(user, 1, 1, "Content 5");

		expect(stored()).toEqual([
			{
				id: "article-1",
				children: [{ id: "article-2" }, { id: "article-5" }],
			},
			{ id: "article-3" },
		]);
		// Unfolded, so the Reference is visible where it was put.
		await screen.findByText("Content 5");
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 1],
			["Content 5", 1],
			["Content 3", 0],
		]);
	});

	it("keeps a folded branch elsewhere folded", async () => {
		const user = userEvent.setup();
		renderTree({
			value: [
				{ id: "article-1" },
				{ id: "article-2", children: [{ id: "article-3" }] },
			],
		});
		await user.click(
			await screen.findByRole("button", { name: "Collapse Content 2" }),
		);

		// Before the first row, which renames every row below it.
		await insertThrough(user, 0, 0, "Content 5");

		expect(
			await screen.findByRole("button", { name: "Expand Content 2" }),
		).toBeInTheDocument();
	});

	it("leaves the stored value alone until a Content is chosen", async () => {
		const user = userEvent.setup();
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		await user.click(pointAt(1, 0));
		await screen.findByTestId("reference-picker");
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(stored()).toEqual(branchedTree);
	});

	it("still appends at the root through the Add control", async () => {
		const user = userEvent.setup();
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");

		await user.click(screen.getByRole("button", { name: "Add reference" }));
		const picker = await screen.findByTestId("reference-picker");
		await user.click(await within(picker).findByText("Content 5"));

		expect(stored()).toEqual([...branchedTree, { id: "article-5" }]);
	});
});

describe("when the strips stand down", () => {
	it("disables them at max_items", async () => {
		renderTree({
			value: branchedTree,
			settings: { blueprints: ["article"], max_items: 4 },
		});
		await screen.findByText("Content 1");

		for (const strip of strips()) expect(strip).toBeDisabled();
		expect(strips()[1]).toHaveAttribute(
			"aria-label",
			"Maximum number of References reached",
		);
	});

	it("leaves them alone below the cap, and with no cap set at all", async () => {
		const capped = renderTree({
			value: branchedTree,
			settings: { blueprints: ["article"], max_items: 5 },
		});
		await screen.findByText("Content 1");
		for (const strip of strips()) expect(strip).not.toBeDisabled();
		capped.unmount();

		// An unset cap is no cap — never a cap of zero.
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");
		for (const strip of strips()) expect(strip).not.toBeDisabled();
	});

	it("replaces them with inert spacers while a drag is running", async () => {
		const rects = mockRowRects();
		renderTree({ value: branchedTree });
		await screen.findByText("Content 1");
		expect(strips()).toHaveLength(5);

		await liftRow("Content 1");

		// Two insertion affordances must never compete for the same gap.
		expect(strips()).toHaveLength(0);
		expect(screen.queryAllByTestId("reference-insert-spacer")).toHaveLength(5);

		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? document.body, {
				code: "Escape",
			});
		});
		expect(strips()).toHaveLength(5);
		rects.mockRestore();
	});
});
