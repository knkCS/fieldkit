// src/schema/__tests__/reference-tree.test.ts
import { describe, expect, it } from "vitest";
import type { Reference } from "../reference";
import type { FlatReference } from "../reference-tree";
import {
	countReferences,
	flattenReferences,
	nestReferences,
	projectDropDepth,
} from "../reference-tree";

/** A three-generation tree, used by most of the flatten/nest tests. */
const tree: Reference[] = [
	{
		id: "a",
		children: [{ id: "a1", children: [{ id: "a1x" }] }, { id: "a2" }],
	},
	{ id: "b" },
];

describe("flattenReferences", () => {
	it("walks depth-first, so the list reads in the tree's own order", () => {
		expect(flattenReferences(tree).map((item) => item.reference.id)).toEqual([
			"a",
			"a1",
			"a1x",
			"a2",
			"b",
		]);
	});

	it("indexes each entry by its depth, roots being 0", () => {
		expect(flattenReferences(tree).map((item) => item.depth)).toEqual([
			0, 1, 2, 1, 0,
		]);
	});

	it("measures how tall each Reference's own branch is", () => {
		// The height outlives the branch's rows: a drag hides them, and the
		// depth ceiling still has to know how far below the drop they reach.
		expect(
			flattenReferences(tree).map((item) => [item.reference.id, item.height]),
		).toEqual([
			["a", 2],
			["a1", 1],
			["a1x", 0],
			["a2", 0],
			["b", 0],
		]);
	});
});

describe("nestReferences", () => {
	it("rebuilds the tree flattening produced", () => {
		expect(nestReferences(flattenReferences(tree))).toEqual(tree);
	});

	it("reads depth and list order alone, so a hand-built list nests", () => {
		expect(
			nestReferences([
				{ reference: { id: "a" }, depth: 0 },
				{ reference: { id: "a1" }, depth: 1 },
				{ reference: { id: "b" }, depth: 0 },
			]),
		).toEqual([{ id: "a", children: [{ id: "a1" }] }, { id: "b" }]);
	});

	it("clamps a list that skips a level instead of throwing", () => {
		expect(
			nestReferences([
				{ reference: { id: "a" }, depth: 0 },
				{ reference: { id: "a1" }, depth: 3 },
			]),
		).toEqual([{ id: "a", children: [{ id: "a1" }] }]);
	});
});

describe("the flatten/nest round trip", () => {
	it("carries every Pin and every Attribute back unchanged", () => {
		// Nothing populates Pins or Attributes yet (#67, #68) — the round trip
		// has to hold for them before it does, or those tickets come back here.
		const pinned: Reference[] = [
			{
				id: "a",
				pin: "release-3",
				attributes: { page: 12, note: null, tags: ["x"] },
				children: [
					{ id: "a1", pin: null },
					{ id: "a2", attributes: { role: "author" } },
				],
			},
			{ id: "b", attributes: {} },
		];
		expect(nestReferences(flattenReferences(pinned))).toEqual(pinned);
	});

	it("carries an Attribute record across rather than copying it", () => {
		// Attribute values are the Consumer's, opaque to fieldkit (ADR-0008),
		// so a drag moves the record it was given instead of cloning values
		// it cannot know the shape of.
		const attributes = { page: 12 };
		const round = nestReferences(flattenReferences([{ id: "a", attributes }]));
		expect(round[0].attributes).toBe(attributes);
	});

	it("rebuilds every branch, so mutating the result leaves the input alone", () => {
		const source: Reference[] = [{ id: "a", children: [{ id: "a1" }] }];
		const round = nestReferences(flattenReferences(source));
		round[0].children?.push({ id: "a2" });
		expect(source[0].children).toEqual([{ id: "a1" }]);
	});

	it("normalises an empty `children` away — it says nothing a missing one does not", () => {
		expect(
			nestReferences(flattenReferences([{ id: "a", children: [] }])),
		).toEqual([{ id: "a" }]);
	});
});

describe("countReferences", () => {
	it("counts every Reference at every level, not only the roots", () => {
		// `tree` holds a, a1, a1x, a2, b — a cap of 2 is exceeded by a tree
		// with two roots the moment either of them has a child.
		expect(countReferences(tree)).toBe(5);
	});

	it("counts an empty tree as none", () => {
		expect(countReferences([])).toBe(0);
	});
});

/** One flattened row, spelled out so the projection tests never lean on
 * `flattenReferences` to say what a list looks like. */
const row = (id: string, depth: number, height = 0): FlatReference => ({
	reference: { id },
	depth,
	height,
});

/** 24px of indentation per level, which is what the rows will render at. */
const INDENT = 24;

describe("projectDropDepth — the neighbours' bounds", () => {
	// p
	//   q
	//     r
	// d          <- dragged, and already at the bottom
	const items = [row("p", 0), row("q", 1), row("r", 2), row("d", 0)];

	it("goes no deeper than one level below the Reference above the slot", () => {
		expect(
			projectDropDepth({
				items,
				activeIndex: 3,
				overIndex: 3,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 3, minDepth: 0, maxDepth: 3 });
	});

	it("goes no shallower than the Reference below the slot", () => {
		// Dropped between p and its child q: landing at depth 0 would adopt q.
		expect(
			projectDropDepth({
				items: [row("p", 0), row("q", 1), row("d", 0)],
				activeIndex: 2,
				overIndex: 1,
				offsetX: 0,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 1, minDepth: 1, maxDepth: 1 });
	});

	it("reads the pointer offset as whole levels of indentation", () => {
		expect(
			projectDropDepth({
				items,
				activeIndex: 3,
				overIndex: 3,
				offsetX: INDENT * 2,
				indentWidth: INDENT,
			}).depth,
		).toBe(2);
	});

	it("has no ceiling of its own: an unset one leaves the neighbours in charge", () => {
		expect(
			projectDropDepth({
				items,
				activeIndex: 3,
				overIndex: 3,
				offsetX: 1000,
				indentWidth: INDENT,
				depthCeiling: undefined,
			}).depth,
		).toBe(3);
	});

	it("drags left as readily as right, bottoming out at the slot's minimum", () => {
		expect(
			projectDropDepth({
				items: [row("p", 0), row("q", 1), row("d", 2)],
				activeIndex: 2,
				overIndex: 2,
				offsetX: -1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 2 });
	});
});

describe("projectDropDepth — the dragged branch", () => {
	// a
	//   a1        <- a's branch, still rendered
	// b
	const withBranch = [row("a", 0, 1), row("a1", 1), row("b", 0)];
	// The same drag, with a's branch pruned the way the sortable-tree
	// pattern prunes it — the answers have to agree.
	const pruned = [row("a", 0, 1), row("b", 0)];

	it("reads the same whether the caller prunes the branch or renders it", () => {
		// Dragged to the bottom and rightwards: a lands under b, and b's own
		// depth is what says how far under.
		const underB = { depth: 1, minDepth: 0, maxDepth: 1 };
		expect(
			projectDropDepth({
				items: withBranch,
				activeIndex: 0,
				overIndex: 2,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual(underB);
		expect(
			projectDropDepth({
				items: pruned,
				activeIndex: 0,
				overIndex: 1,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual(underB);
	});

	it("never offers a Reference a place inside its own branch", () => {
		// Over its own child: without the branch rule a1 would look like the
		// Reference above the slot, and a would nest under its own child.
		expect(
			projectDropDepth({
				items: withBranch,
				activeIndex: 0,
				overIndex: 1,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 0 });
	});
});

describe("projectDropDepth — degenerate input", () => {
	it("answers root depth for a list with nothing in it", () => {
		expect(
			projectDropDepth({
				items: [],
				activeIndex: 0,
				overIndex: 0,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 0 });
	});

	it("ignores the pointer rather than dividing by an unmeasured indent", () => {
		expect(
			projectDropDepth({
				items: [row("p", 0), row("d", 0)],
				activeIndex: 1,
				overIndex: 1,
				offsetX: 1000,
				indentWidth: 0,
			}).depth,
		).toBe(0);
	});
});

describe("projectDropDepth — the max-depth ceiling", () => {
	// p
	//   q
	//     r
	// d          <- dragged, and already at the bottom
	const items = [row("p", 0), row("q", 1), row("r", 2), row("d", 0)];

	it("stops at the ceiling even where the neighbours would allow deeper", () => {
		expect(
			projectDropDepth({
				items,
				activeIndex: 3,
				overIndex: 3,
				offsetX: 1000,
				indentWidth: INDENT,
				depthCeiling: 1,
			}),
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1 });
	});

	it("spends the ceiling on the dragged branch's own height first", () => {
		// d carries a child, so landing at depth 2 would put that child at 3.
		const withBranch = [row("p", 0), row("q", 1), row("r", 2), row("d", 0, 1)];
		expect(
			projectDropDepth({
				items: withBranch,
				activeIndex: 3,
				overIndex: 3,
				offsetX: 1000,
				indentWidth: INDENT,
				depthCeiling: 2,
			}),
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1 });
	});

	it("keeps a branch taller than the ceiling at the root rather than below it", () => {
		const tall = [row("p", 0), row("d", 0, 3)];
		expect(
			projectDropDepth({
				items: tall,
				activeIndex: 1,
				overIndex: 1,
				offsetX: 1000,
				indentWidth: INDENT,
				depthCeiling: 1,
			}),
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 0 });
	});

	it("wins against the floor the neighbours set, rather than reporting a bound it broke", () => {
		// Dropped between q (depth 1) and r (depth 2): the neighbours want 2,
		// the ceiling allows 1. r is already past the ceiling — that is the
		// Schema's to report, and not something a drag should deepen.
		expect(
			projectDropDepth({
				items,
				activeIndex: 3,
				overIndex: 2,
				offsetX: 1000,
				indentWidth: INDENT,
				depthCeiling: 1,
			}),
		).toEqual({ depth: 1, minDepth: 1, maxDepth: 1 });
	});
});
