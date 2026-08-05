// src/schema/__tests__/reference-tree.test.ts
import { describe, expect, it } from "vitest";
import type { Reference } from "../reference";
import type { FlatReference, ReferenceRow } from "../reference-tree";
import {
	countReferences,
	flattenReferences,
	foldsToReveal,
	initialReferenceFolds,
	moveReferenceBranch,
	nestReferences,
	projectDropDepth,
	projectInsertDepth,
	REFERENCE_TREE_COLLAPSE_THRESHOLD,
	readReferenceTree,
	referenceAncestorKeys,
	referenceAncestorRows,
	referenceBranchEnd,
	referenceDropTarget,
	referencesPastDepth,
	referenceTreeOpensFolded,
	removeReferenceAt,
	spliceReference,
	visibleReferenceRows,
	writeReferenceTree,
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

describe("referencesPastDepth", () => {
	it("finds nothing in a tree the ceiling has room for", () => {
		// `tree` reaches depth 2 (a → a1 → a1x), so a ceiling of 2 fits it.
		expect(referencesPastDepth(tree, 2)).toEqual([]);
	});

	it("addresses the offender inside the stored value, `children` and all", () => {
		// a1x sits at depth 2, one past a ceiling of 1 — and it is
		// `value[0].children[0].children[0]`.
		expect(referencesPastDepth(tree, 1)).toEqual([
			[0, "children", 0, "children", 0],
		]);
	});

	it("names the shallowest offender in a branch, never its descendants too", () => {
		// a1 breaks a ceiling of 0, and a1x is only deep because a1 is: one
		// error per branch, not one per Reference under it.
		expect(referencesPastDepth(tree, 0)).toEqual([
			[0, "children", 0],
			[0, "children", 1],
		]);
	});

	it("reports every branch that breaks the ceiling, not just the first", () => {
		expect(
			referencesPastDepth(
				[
					{ id: "a", children: [{ id: "a1" }] },
					{ id: "b", children: [{ id: "b1" }] },
				],
				0,
			),
		).toEqual([
			[0, "children", 0],
			[1, "children", 0],
		]);
	});

	it("reports the roots themselves when no depth at all is allowed", () => {
		// A ceiling below zero has no legal depth in it — what `max_depth: 0`
		// converts to. Degenerate, and reported rather than quietly ignored.
		expect(referencesPastDepth(tree, -1)).toEqual([[0], [1]]);
	});

	it("finds nothing in an empty tree", () => {
		expect(referencesPastDepth([], 0)).toEqual([]);
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
		).toEqual({ depth: 3, minDepth: 0, maxDepth: 3, adopted: [] });
	});

	it("offers a leaf one level shallower than the Reference below it", () => {
		// Dropped between p and its child q, at p's own depth: q follows a
		// Reference shallower than itself, so q becomes its child. That is
		// Adoption, and ADR-0012 makes it the point rather than the hazard.
		expect(
			projectDropDepth({
				items: [row("p", 0), row("q", 1), row("d", 0)],
				activeIndex: 2,
				overIndex: 1,
				offsetX: 0,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 1, adopted: [row("q", 1)] });
	});

	it("keeps the old floor for a Reference carrying children of its own", () => {
		// d already has a branch: it cannot adopt one while bringing one, so
		// the Reference below still sets the floor at its own depth.
		expect(
			projectDropDepth({
				items: [row("p", 0), row("q", 1), row("d", 0, 1), row("d1", 1)],
				activeIndex: 2,
				overIndex: 1,
				offsetX: 0,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 1, minDepth: 1, maxDepth: 1, adopted: [] });
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
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 2, adopted: [] });
	});
});

describe("projectDropDepth — what a drop would adopt", () => {
	// p
	//   q
	//     q1
	// d          <- dragged leaf, at the bottom
	const items = [row("p", 0), row("q", 1, 1), row("q1", 2), row("d", 0)];

	it("names every row that would move, branches included", () => {
		// Landing between p and q at depth 0 takes q — and q1 travels with it,
		// because a branch goes where its Reference goes.
		expect(
			projectDropDepth({
				items,
				activeIndex: 3,
				overIndex: 1,
				offsetX: 0,
				indentWidth: INDENT,
			}).adopted,
		).toEqual([row("q", 1, 1), row("q1", 2)]);
	});

	it("adopts nothing when the drop lands beside the Reference below it", () => {
		// The same slot, one level deeper: d is q's sibling and nothing moves.
		expect(
			projectDropDepth({
				items,
				activeIndex: 3,
				overIndex: 1,
				offsetX: INDENT,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1, adopted: [] });
	});

	it("stops at the first row that is not deeper than the drop", () => {
		// q's branch ends at q1; r is a root and closes the run.
		expect(
			projectDropDepth({
				items: [...items.slice(0, 3), row("r", 0), row("d", 0)],
				activeIndex: 4,
				overIndex: 1,
				offsetX: 0,
				indentWidth: INDENT,
			}).adopted,
		).toEqual([row("q", 1, 1), row("q1", 2)]);
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
		const underB = { depth: 1, minDepth: 0, maxDepth: 1, adopted: [] };
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
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 0, adopted: [] });
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
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 0, adopted: [] });
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
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1, adopted: [] });
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
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1, adopted: [] });
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
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 0, adopted: [] });
	});

	it("spends it on the branch that would be adopted too, not only the one moving", () => {
		// p / q(+q1) / d, ceiling 1 — q1 already sits at 2, one past it. The
		// floor would offer depth 0 so that d could adopt q; taking it would
		// hang a branch that reaches 2 under a Reference at 0, so the offer is
		// withdrawn and the Reference below sets the floor as it used to.
		expect(
			projectDropDepth({
				items: [row("p", 0), row("q", 1, 1), row("q1", 2), row("d", 0)],
				activeIndex: 3,
				overIndex: 1,
				offsetX: 0,
				indentWidth: INDENT,
				depthCeiling: 1,
			}),
		).toEqual({ depth: 1, minDepth: 1, maxDepth: 1, adopted: [] });
	});

	it("offers the same adoption when the ceiling has room for the branch", () => {
		expect(
			projectDropDepth({
				items: [row("p", 0), row("q", 1, 1), row("q1", 2), row("d", 0)],
				activeIndex: 3,
				overIndex: 1,
				offsetX: 0,
				indentWidth: INDENT,
				depthCeiling: 2,
			}),
		).toEqual({
			depth: 0,
			minDepth: 0,
			maxDepth: 1,
			adopted: [row("q", 1, 1), row("q1", 2)],
		});
	});

	it("measures the adopted branch as it will be, not as the drag found it", () => {
		// a > b > d, ceiling 1, and d is being dragged out from under b. b's
		// own height is 1 — but every bit of that height is d, which is
		// leaving. Reading b as a Reference with a branch would withdraw an
		// adoption that fits: the drop produces `a` and `d > b`, which reaches
		// exactly the ceiling.
		const items = flattenReferences([
			{ id: "a", children: [{ id: "b", children: [{ id: "d" }] }] },
		]);
		expect(
			projectDropDepth({
				items,
				activeIndex: 2,
				overIndex: 1,
				offsetX: -1000,
				indentWidth: INDENT,
				depthCeiling: 1,
			}),
		).toEqual({
			depth: 0,
			minDepth: 0,
			maxDepth: 1,
			adopted: [{ reference: { id: "b" }, depth: 1, height: 1 }],
		});
		// And the tree it actually produces is within the ceiling, which is
		// the claim the clamp exists to keep.
		const dropped = nestReferences(
			moveReferenceBranch({ items, activeIndex: 2, overIndex: 1, depth: 0 }),
		);
		expect(dropped).toEqual([
			{ id: "a" },
			{ id: "d", children: [{ id: "b" }] },
		]);
		expect(referencesPastDepth(dropped, 1)).toEqual([]);
	});

	it("wins against the floor the neighbours set, rather than reporting a bound it broke", () => {
		// Dropped between q (depth 1) and r (depth 2): the neighbours want 2,
		// the ceiling allows 1. r is already past the ceiling — that is the
		// Schema's to report, and not something a drag should deepen. The
		// ceiling forces an adoption the floor would not have offered, and the
		// projection still says so rather than letting it happen unannounced.
		expect(
			projectDropDepth({
				items,
				activeIndex: 3,
				overIndex: 2,
				offsetX: 1000,
				indentWidth: INDENT,
				depthCeiling: 1,
			}),
		).toEqual({
			depth: 1,
			minDepth: 1,
			maxDepth: 1,
			adopted: [row("r", 2)],
		});
	});
});

describe("referenceDropTarget — the row a drop lands before", () => {
	// a
	// b
	// c
	const flat = [row("a", 0), row("b", 0), row("c", 0)];

	it("names the row that follows a drop moving down the list", () => {
		// a over b: a lands between b and c, so c is what follows it.
		expect(
			referenceDropTarget({ items: flat, activeIndex: 0, overIndex: 1 }),
		).toEqual(row("c", 0));
	});

	it("names the row that follows a drop moving up the list", () => {
		// c over a: c lands at the top, so a is what follows it.
		expect(
			referenceDropTarget({ items: flat, activeIndex: 2, overIndex: 0 }),
		).toEqual(row("a", 0));
	});

	it("answers nothing when the drop lands after the last row", () => {
		expect(
			referenceDropTarget({ items: flat, activeIndex: 0, overIndex: 2 }),
		).toBeNull();
	});

	it("skips the dragged Reference's own branch, which travels with it", () => {
		// a
		//   a1        <- a's branch, still in the list
		// b
		const withBranch = [row("a", 0, 1), row("a1", 1), row("b", 0)];
		// Hovering its own child is an ask for nothing: a stays put, and b is
		// what follows its branch.
		expect(
			referenceDropTarget({ items: withBranch, activeIndex: 0, overIndex: 1 }),
		).toEqual(row("b", 0));
		// Over b, the branch moves past it and lands at the end.
		expect(
			referenceDropTarget({ items: withBranch, activeIndex: 0, overIndex: 2 }),
		).toBeNull();
	});

	it("answers the same slot the move puts the branch in", () => {
		// The pin: what the indicator draws and what the release performs are
		// one answer. The row named here is the row the moved list puts
		// immediately after the dragged branch.
		const withBranch = [row("a", 0, 1), row("a1", 1), row("b", 0)];
		const moved = moveReferenceBranch({
			items: withBranch,
			activeIndex: 0,
			overIndex: 2,
			depth: 0,
		});
		const target = referenceDropTarget({
			items: withBranch,
			activeIndex: 0,
			overIndex: 2,
		});
		const landed = moved.findIndex((item) => item.reference.id === "a");
		expect(moved[landed + 2] ?? null).toEqual(target);
	});

	it("answers nothing for an index the list does not reach", () => {
		expect(
			referenceDropTarget({ items: [], activeIndex: 0, overIndex: 0 }),
		).toBeNull();
	});
});

describe("projectInsertDepth — the neighbours' bounds", () => {
	// a
	//   a1
	// b
	const items = [row("a", 0, 1), row("a1", 1), row("b", 0)];

	it("goes one level deeper than the row above the slot, and no further", () => {
		// Between a1 and b: a1 is the row above, so a child of a1 is the most
		// nesting the slot has to offer.
		expect(
			projectInsertDepth({
				items,
				slot: 2,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 2, minDepth: 0, maxDepth: 2, adopted: [] });
	});

	it("goes one level shallower than the row below, which is what adopts it", () => {
		// Between a and a1: at depth 0 the new Reference is a's sibling, and
		// a1 — which follows it deeper than it — becomes its child instead.
		expect(
			projectInsertDepth({
				items,
				slot: 1,
				offsetX: 0,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 1, adopted: [row("a1", 1)] });
	});

	it("adopts nothing when it lands at the row below's own depth", () => {
		expect(
			projectInsertDepth({
				items,
				slot: 1,
				offsetX: INDENT,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1, adopted: [] });
	});

	it("reads the pointer as the column it is in, not as travel from a depth", () => {
		// Unlike a drag, an insert starts from no depth at all: the offset is
		// measured from the tree's left edge, so it names a level outright.
		expect(
			projectInsertDepth({
				items,
				slot: 2,
				offsetX: INDENT + INDENT / 2,
				indentWidth: INDENT,
			}).depth,
		).toBe(1);
	});

	it("offers only a root before the first row", () => {
		// Nothing above the slot, and nothing shallower than a root to adopt
		// the first row with.
		expect(
			projectInsertDepth({
				items,
				slot: 0,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 0, adopted: [] });
	});

	it("is bounded by the last row alone past the end of the list", () => {
		expect(
			projectInsertDepth({
				items,
				slot: 3,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1, adopted: [] });
	});

	it("answers root depth for a tree with nothing in it", () => {
		expect(
			projectInsertDepth({
				items: [],
				slot: 0,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 0, minDepth: 0, maxDepth: 0, adopted: [] });
	});

	it("ignores the pointer rather than dividing by an unmeasured indent", () => {
		expect(
			projectInsertDepth({
				items,
				slot: 3,
				offsetX: 1000,
				indentWidth: 0,
			}).depth,
		).toBe(0);
	});

	it("clamps a slot the list does not reach to one of its ends", () => {
		expect(
			projectInsertDepth({
				items,
				slot: 99,
				offsetX: 1000,
				indentWidth: INDENT,
			}),
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1, adopted: [] });
	});
});

describe("projectInsertDepth — the max-depth ceiling", () => {
	// a
	//   a1
	//     a1x
	// b
	const items = [row("a", 0, 2), row("a1", 1, 1), row("a1x", 2), row("b", 0)];

	it("stops at the ceiling even where the neighbours would allow deeper", () => {
		expect(
			projectInsertDepth({
				items,
				slot: 3,
				offsetX: 1000,
				indentWidth: INDENT,
				depthCeiling: 1,
			}),
		).toEqual({ depth: 1, minDepth: 0, maxDepth: 1, adopted: [] });
	});

	it("spends it on the branch that would be adopted", () => {
		// Between a and a1, ceiling 1: inserting at depth 0 would adopt a1 and
		// with it a1x, which already sits at 2. The adopting level is not
		// offered, and the row below sets the floor at its own depth.
		expect(
			projectInsertDepth({
				items,
				slot: 1,
				offsetX: 0,
				indentWidth: INDENT,
				depthCeiling: 1,
			}),
		).toEqual({ depth: 1, minDepth: 1, maxDepth: 1, adopted: [] });
	});

	it("offers the same adoption when the ceiling has room for that branch", () => {
		expect(
			projectInsertDepth({
				items,
				slot: 1,
				offsetX: 0,
				indentWidth: INDENT,
				depthCeiling: 2,
			}),
		).toEqual({
			depth: 0,
			minDepth: 0,
			maxDepth: 1,
			adopted: [row("a1", 1, 1), row("a1x", 2)],
		});
	});

	it("has no ceiling of its own: an unset one leaves the neighbours in charge", () => {
		expect(
			projectInsertDepth({
				items,
				slot: 3,
				offsetX: 1000,
				indentWidth: INDENT,
				depthCeiling: undefined,
			}).depth,
		).toBe(3);
	});
});

describe("spliceReference", () => {
	/** The spliced list, read the way an insert handler reads it. */
	const shape = (items: { reference: { id: string }; depth: number }[]) =>
		items.map((item) => [item.reference.id, item.depth]);

	// a
	//   a1
	//     a1x
	//   a2
	// b
	const items = flattenReferences(tree);

	it("puts the Reference in at the position and depth it was given", () => {
		expect(
			shape(
				spliceReference({
					items,
					reference: { id: "x" },
					slot: 4,
					depth: 1,
				}),
			),
		).toEqual([
			["a", 0],
			["a1", 1],
			["a1x", 2],
			["a2", 1],
			["x", 1],
			["b", 0],
		]);
	});

	it("re-nests as a sibling where nothing follows it deeper", () => {
		expect(
			nestReferences(
				spliceReference({ items, reference: { id: "x" }, slot: 4, depth: 1 }),
			),
		).toEqual([
			{
				id: "a",
				children: [
					{ id: "a1", children: [{ id: "a1x" }] },
					{ id: "a2" },
					{ id: "x" },
				],
			},
			{ id: "b" },
		]);
	});

	it("takes the rows that follow it deeper as its children", () => {
		// Spliced as a root between a and its branch: a1 and a2 follow at
		// depth 1, deeper than the arrival at 0, so they and a1's own branch
		// come across. a is left childless — Adoption, and nothing asked for it.
		expect(
			nestReferences(
				spliceReference({ items, reference: { id: "x" }, slot: 1, depth: 0 }),
			),
		).toEqual([
			{ id: "a" },
			{
				id: "x",
				children: [{ id: "a1", children: [{ id: "a1x" }] }, { id: "a2" }],
			},
			{ id: "b" },
		]);
	});

	it("leaves a's branch alone when it arrives at its children's depth", () => {
		expect(
			nestReferences(
				spliceReference({ items, reference: { id: "x" }, slot: 1, depth: 1 }),
			),
		).toEqual([
			{
				id: "a",
				children: [
					{ id: "x" },
					{ id: "a1", children: [{ id: "a1x" }] },
					{ id: "a2" },
				],
			},
			{ id: "b" },
		]);
	});

	it("re-bases an adopted branch that skipped a level, keeping its shape", () => {
		// Spliced between a1 and a1x as a root: a1x has nowhere at depth 2 to
		// hang from any more, so it lands at the deepest level available and
		// its own branch follows it.
		expect(
			nestReferences(
				spliceReference({
					items: flattenReferences([
						{
							id: "a",
							children: [
								{
									id: "a1",
									children: [{ id: "a1x", children: [{ id: "deep" }] }],
								},
							],
						},
					]),
					reference: { id: "x" },
					slot: 2,
					depth: 0,
				}),
			),
		).toEqual([
			{ id: "a", children: [{ id: "a1" }] },
			{ id: "x", children: [{ id: "a1x", children: [{ id: "deep" }] }] },
		]);
	});

	it("carries the Reference's own Pin and Attributes in", () => {
		const attributes = { page: 12 };
		const spliced = spliceReference({
			items,
			reference: { id: "x", pin: "release-3", attributes },
			slot: 0,
			depth: 0,
		});
		expect(spliced[0].reference).toEqual({
			id: "x",
			pin: "release-3",
			attributes,
		});
	});

	it("drops a branch on the Reference being inserted — nesting comes from the list", () => {
		// Depth and order are the whole of what `nestReferences` reads, so a
		// `children` travelling in on the value would be nested twice.
		expect(
			nestReferences(
				spliceReference({
					items: [],
					reference: { id: "x", children: [{ id: "smuggled" }] },
					slot: 0,
					depth: 0,
				}),
			),
		).toEqual([{ id: "x" }]);
	});

	it("clamps a slot past either end of the list", () => {
		expect(
			shape(
				spliceReference({ items, reference: { id: "x" }, slot: 99, depth: 0 }),
			).at(-1),
		).toEqual(["x", 0]);
		expect(
			shape(
				spliceReference({ items, reference: { id: "x" }, slot: -5, depth: 0 }),
			).at(0),
		).toEqual(["x", 0]);
	});

	it("leaves the entries it was given untouched", () => {
		const before = shape(items);
		spliceReference({ items, reference: { id: "x" }, slot: 1, depth: 0 });
		expect(shape(items)).toEqual(before);
	});
});

describe("the flatten/splice/nest round trip", () => {
	const pinned: Reference[] = [
		{
			id: "a",
			pin: "release-3",
			attributes: { page: 12 },
			children: [
				{
					id: "a1",
					pin: null,
					children: [{ id: "a1x", attributes: { n: 1 } }],
				},
				{ id: "a2", attributes: { role: "author" } },
			],
		},
		{ id: "b" },
	];

	it("gives everything back, adopted branches and all", () => {
		// Inserted as a root between a and its children: a1 and a2 move onto it
		// with their Pins, their Attributes and a1's own branch intact.
		expect(
			nestReferences(
				spliceReference({
					items: flattenReferences(pinned),
					reference: { id: "x" },
					slot: 1,
					depth: 0,
				}),
			),
		).toEqual([
			{ id: "a", pin: "release-3", attributes: { page: 12 } },
			{
				id: "x",
				children: [
					{
						id: "a1",
						pin: null,
						children: [{ id: "a1x", attributes: { n: 1 } }],
					},
					{ id: "a2", attributes: { role: "author" } },
				],
			},
			{ id: "b" },
		]);
	});

	it("splices nothing away when the insert adopts nothing", () => {
		expect(
			nestReferences(
				spliceReference({
					items: flattenReferences(pinned),
					reference: { id: "x" },
					slot: 5,
					depth: 0,
				}),
			),
		).toEqual([...pinned, { id: "x" }]);
	});

	it("counts one more Reference, and no fewer — adoption moves, it does not add", () => {
		const before = countReferences(pinned);
		const after = countReferences(
			nestReferences(
				spliceReference({
					items: flattenReferences(pinned),
					reference: { id: "x" },
					slot: 1,
					depth: 0,
				}),
			),
		);
		expect(after).toBe(before + 1);
	});
});

describe("adoption through a drag", () => {
	// a
	//   a1
	//     a1x
	//   a2
	// b            <- a leaf, dragged up between a and a1
	const items = flattenReferences(tree);

	it("takes the branch below the drop as its own", () => {
		const { depth, adopted } = projectDropDepth({
			items,
			activeIndex: 4,
			overIndex: 1,
			offsetX: -1000,
			indentWidth: INDENT,
		});
		expect(adopted.map((entry) => entry.reference.id)).toEqual([
			"a1",
			"a1x",
			"a2",
		]);
		expect(
			nestReferences(
				moveReferenceBranch({ items, activeIndex: 4, overIndex: 1, depth }),
			),
		).toEqual([
			{ id: "a" },
			{
				id: "b",
				children: [{ id: "a1", children: [{ id: "a1x" }] }, { id: "a2" }],
			},
		]);
	});

	it("moves References without adding or removing any", () => {
		const { depth } = projectDropDepth({
			items,
			activeIndex: 4,
			overIndex: 1,
			offsetX: -1000,
			indentWidth: INDENT,
		});
		expect(
			countReferences(
				nestReferences(
					moveReferenceBranch({ items, activeIndex: 4, overIndex: 1, depth }),
				),
			),
		).toBe(countReferences(tree));
	});

	it("carries the Pins and Attributes of every Reference that moved", () => {
		const pinned: Reference[] = [
			{
				id: "a",
				children: [{ id: "a1", pin: "release-3", attributes: { page: 12 } }],
			},
			{ id: "b", attributes: { role: "author" } },
		];
		const rows = flattenReferences(pinned);
		const { depth } = projectDropDepth({
			items: rows,
			activeIndex: 2,
			overIndex: 1,
			offsetX: -1000,
			indentWidth: INDENT,
		});
		expect(
			nestReferences(
				moveReferenceBranch({
					items: rows,
					activeIndex: 2,
					overIndex: 1,
					depth,
				}),
			),
		).toEqual([
			{ id: "a" },
			{
				id: "b",
				attributes: { role: "author" },
				children: [{ id: "a1", pin: "release-3", attributes: { page: 12 } }],
			},
		]);
	});
});

describe("referenceBranchEnd", () => {
	// a
	//   a1
	//     a1x
	//   a2
	// b
	const items = flattenReferences(tree);

	it("answers a leaf with its own index — a leaf is its whole branch", () => {
		expect(referenceBranchEnd(items, 2)).toBe(2); // a1x
		expect(referenceBranchEnd(items, 4)).toBe(4); // b
	});

	it("reaches the last row of the branch, not just the first child", () => {
		expect(referenceBranchEnd(items, 0)).toBe(3); // a … a2
		expect(referenceBranchEnd(items, 1)).toBe(2); // a1 … a1x
	});

	it("reads depth alone, so a hand-built list answers for itself", () => {
		expect(referenceBranchEnd([row("p", 0), row("q", 1), row("r", 0)], 0)).toBe(
			1,
		);
	});

	it("answers an index that does not resolve with itself", () => {
		expect(referenceBranchEnd(items, 99)).toBe(99);
	});
});

describe("moveReferenceBranch", () => {
	/** The moved list, read the way a drop handler reads it. */
	const shape = (items: { reference: { id: string }; depth: number }[]) =>
		items.map((item) => [item.reference.id, item.depth]);

	describe("among siblings", () => {
		const items = [row("a", 0), row("b", 0), row("c", 0)];

		it("moves a Reference down to where the drop landed", () => {
			expect(
				shape(
					moveReferenceBranch({
						items,
						activeIndex: 0,
						overIndex: 2,
						depth: 0,
					}),
				),
			).toEqual([
				["b", 0],
				["c", 0],
				["a", 0],
			]);
		});

		it("moves a Reference up just as readily", () => {
			expect(
				shape(
					moveReferenceBranch({
						items,
						activeIndex: 2,
						overIndex: 0,
						depth: 0,
					}),
				),
			).toEqual([
				["c", 0],
				["a", 0],
				["b", 0],
			]);
		});

		it("leaves the order alone when a Reference is dropped on itself", () => {
			expect(
				shape(
					moveReferenceBranch({
						items,
						activeIndex: 1,
						overIndex: 1,
						depth: 0,
					}),
				),
			).toEqual([
				["a", 0],
				["b", 0],
				["c", 0],
			]);
		});
	});

	describe("the branch that travels with it", () => {
		// a
		//   a1
		//     a1x
		//   a2
		// b
		const items = flattenReferences(tree);

		it("takes every descendant along, in the order they were in", () => {
			expect(
				shape(
					moveReferenceBranch({
						items,
						activeIndex: 0,
						overIndex: 4,
						depth: 0,
					}),
				),
			).toEqual([
				["b", 0],
				["a", 0],
				["a1", 1],
				["a1x", 2],
				["a2", 1],
			]);
		});

		it("shifts the whole branch by the depth the drop landed at", () => {
			// a nests under b: everything below a goes one level deeper too, so
			// the subtree keeps its shape.
			expect(
				shape(
					moveReferenceBranch({
						items,
						activeIndex: 0,
						overIndex: 4,
						depth: 1,
					}),
				),
			).toEqual([
				["b", 0],
				["a", 1],
				["a1", 2],
				["a1x", 3],
				["a2", 2],
			]);
		});

		it("re-nests into a tree with the subtree intact", () => {
			expect(
				nestReferences(
					moveReferenceBranch({
						items,
						activeIndex: 0,
						overIndex: 4,
						depth: 1,
					}),
				),
			).toEqual([
				{
					id: "b",
					children: [
						{
							id: "a",
							children: [{ id: "a1", children: [{ id: "a1x" }] }, { id: "a2" }],
						},
					],
				},
			]);
		});

		it("moves an inner branch out to a root without disturbing the rest", () => {
			// a1 (with a1x under it) leaves a and lands at the bottom.
			expect(
				nestReferences(
					moveReferenceBranch({
						items,
						activeIndex: 1,
						overIndex: 4,
						depth: 0,
					}),
				),
			).toEqual([
				{ id: "a", children: [{ id: "a2" }] },
				{ id: "b" },
				{ id: "a1", children: [{ id: "a1x" }] },
			]);
		});

		it("promotes a Reference out of its parent when the drop is shallower", () => {
			expect(
				nestReferences(
					moveReferenceBranch({
						items,
						activeIndex: 3,
						overIndex: 3,
						depth: 0,
					}),
				),
			).toEqual([
				{ id: "a", children: [{ id: "a1", children: [{ id: "a1x" }] }] },
				{ id: "a2" },
				{ id: "b" },
			]);
		});
	});

	describe("what a caller gets back", () => {
		it("carries whatever else the caller hung on an entry, in the new order", () => {
			// The point of the generic: a row keyed for React and for dnd-kit
			// comes back in the order the drop produced, so the caller can
			// follow the move without redoing the arithmetic.
			const keyed = [
				{ ...row("a", 0), key: "first" },
				{ ...row("b", 0), key: "second" },
			];
			expect(
				moveReferenceBranch({
					items: keyed,
					activeIndex: 0,
					overIndex: 1,
					depth: 0,
				}).map((item) => item.key),
			).toEqual(["second", "first"]);
		});

		it("leaves the entries it was given untouched", () => {
			const items = [row("a", 0), row("a1", 1)];
			moveReferenceBranch({ items, activeIndex: 1, overIndex: 1, depth: 0 });
			expect(items.map((item) => item.depth)).toEqual([0, 1]);
		});

		it("hands the list back unchanged when the dragged index does not resolve", () => {
			const items = [row("a", 0), row("b", 0)];
			expect(
				shape(
					moveReferenceBranch({
						items,
						activeIndex: 5,
						overIndex: 0,
						depth: 0,
					}),
				),
			).toEqual([
				["a", 0],
				["b", 0],
			]);
		});
	});

	describe("every drag the projection allows", () => {
		it("keeps exactly the References it started with, at legal depths", () => {
			// A sweep rather than a case: a drop handler cannot check its own
			// work, so the two invariants a drag must never break — no
			// Reference lost, duplicated or orphaned, and no level skipped —
			// are asserted over every slot and every reachable depth at once.
			const items = flattenReferences(tree);
			const ids = (references: Reference[]) =>
				flattenReferences(references)
					.map((entry) => entry.reference.id)
					.sort();

			for (let active = 0; active < items.length; active++) {
				for (let over = 0; over < items.length; over++) {
					for (const offsetX of [-1000, -INDENT, 0, INDENT, 1000]) {
						const where = `active=${active} over=${over} dx=${offsetX}`;
						const { depth } = projectDropDepth({
							items,
							activeIndex: active,
							overIndex: over,
							offsetX,
							indentWidth: INDENT,
						});
						const next = nestReferences(
							moveReferenceBranch({
								items,
								activeIndex: active,
								overIndex: over,
								depth,
							}),
						);

						expect(ids(next), where).toEqual(ids(tree));
						flattenReferences(next).forEach((row, index, rows) => {
							const ceiling = index === 0 ? 0 : rows[index - 1].depth + 1;
							expect(row.depth, `${where} row=${index}`).toBeLessThanOrEqual(
								ceiling,
							);
						});
					}
				}
			}
		});
	});

	describe("with projectDropDepth, which is how a drop reads it", () => {
		it("lands exactly where the projection said it would", () => {
			// p / q(child) / d — dragging d up between p and q, asking for as
			// much nesting as the slot allows.
			const items = [row("p", 0), row("q", 1), row("d", 0)];
			const { depth } = projectDropDepth({
				items,
				activeIndex: 2,
				overIndex: 1,
				offsetX: 1000,
				indentWidth: INDENT,
			});
			expect(
				nestReferences(
					moveReferenceBranch({ items, activeIndex: 2, overIndex: 1, depth }),
				),
			).toEqual([{ id: "p", children: [{ id: "d" }, { id: "q" }] }]);
		});
	});
});

describe("readReferenceTree", () => {
	it("reads a nested value into rows, top to bottom", () => {
		expect(
			readReferenceTree(tree).map((row) => [row.reference.id, row.depth]),
		).toEqual([
			["a", 0],
			["a1", 1],
			["a1x", 2],
			["a2", 1],
			["b", 0],
		]);
	});

	it("remembers where in the stored value each Reference came from", () => {
		expect(readReferenceTree(tree).map((row) => row.path)).toEqual([
			[0],
			[0, 0],
			[0, 0, 0],
			[0, 1],
			[1],
		]);
	});

	it("names each row by its path, so two rows on one Content still differ", () => {
		// The same Content may legitimately be referenced twice: an id is not
		// an identity here, and a key has to be.
		const keys = readReferenceTree([
			{ id: "a", children: [{ id: "a" }] },
			{ id: "a" },
		]).map((row) => row.key);
		expect(keys).toEqual(["0", "0.0", "1"]);
		expect(new Set(keys).size).toBe(3);
	});

	it("drops what is not a Reference, at every level, without throwing", () => {
		// Form data is only as well-formed as whatever produced it.
		expect(
			readReferenceTree([
				"loose-id",
				{ id: "a", children: [null, { id: "a1" }, { id: "" }] },
				{ nope: true },
			]).map((row) => [row.reference.id, row.path]),
		).toEqual([
			["a", [1]],
			["a1", [1, 1]],
		]);
	});

	it("reads a value that is not a list at all as no rows", () => {
		expect(readReferenceTree("nonsense")).toEqual([]);
		expect(readReferenceTree(undefined)).toEqual([]);
	});
});

describe("writeReferenceTree", () => {
	it("writes the tree back over the value it came from", () => {
		expect(
			writeReferenceTree([{ id: "a" }, { id: "b" }], [{ id: "b" }]),
		).toEqual([{ id: "b" }]);
	});

	it("puts a top-level stray back where it was", () => {
		expect(
			writeReferenceTree(
				["loose-id", { id: "a" }, { id: "b" }],
				[{ id: "b" }, { id: "a" }],
			),
		).toEqual(["loose-id", { id: "b" }, { id: "a" }]);
	});

	it("keeps a stray that sat past the end of the new tree", () => {
		expect(writeReferenceTree([{ id: "a" }, "loose-id"], [])).toEqual([
			"loose-id",
		]);
	});

	it("round trips through the reader without touching what it read", () => {
		const value = ["loose-id", { id: "a", children: [{ id: "a1" }] }];
		expect(
			writeReferenceTree(value, nestReferences(readReferenceTree(value))),
		).toEqual(value);
	});
});

describe("removeReferenceAt", () => {
	it("takes a root out, and its branch with it", () => {
		expect(removeReferenceAt(tree, [0])).toEqual([{ id: "b" }]);
	});

	it("takes a nested Reference out of its parent's branch", () => {
		expect(removeReferenceAt(tree, [0, 0])).toEqual([
			{ id: "a", children: [{ id: "a2" }] },
			{ id: "b" },
		]);
	});

	it("drops a `children` it emptied rather than leaving an empty one", () => {
		expect(
			removeReferenceAt([{ id: "a", children: [{ id: "a1" }] }], [0, 0]),
		).toEqual([{ id: "a" }]);
	});

	it("leaves every other entry alone, strays included", () => {
		// The paths a removal is given come from the reader, which counts
		// strays: removing by position is the only way to hit what was clicked.
		expect(
			removeReferenceAt(["loose-id", { id: "a" }, { id: "b" }], [1]),
		).toEqual(["loose-id", { id: "b" }]);
	});
});

/**
 * A tree with something to fold at two levels: `a` hides a branch that itself
 * hides one. Read through `readReferenceTree` rather than hand-built, so the
 * keys a fold set names are the keys a control actually holds.
 */
const foldable: Reference[] = [
	{
		id: "a",
		children: [
			{ id: "a1", children: [{ id: "a1x" }, { id: "a1y" }] },
			{ id: "a2" },
		],
	},
	{ id: "b" },
];

/** `foldable`'s rows: keys "0", "0.0", "0.0.0", "0.0.1", "0.1", "1". */
const foldableRows = readReferenceTree(foldable);

/** The ids of whatever rows a fold rule answered with. */
const ids = (rows: readonly ReferenceRow[]) =>
	rows.map((row) => row.reference.id);

describe("visibleReferenceRows", () => {
	it("shows every row when nothing is folded", () => {
		expect(ids(visibleReferenceRows(foldableRows, new Set()))).toEqual([
			"a",
			"a1",
			"a1x",
			"a1y",
			"a2",
			"b",
		]);
	});

	it("hides a folded Reference's branch, keeping the Reference itself", () => {
		// A folded Reference stands in for what it hides, so it stays on screen.
		expect(ids(visibleReferenceRows(foldableRows, new Set(["0.0"])))).toEqual([
			"a",
			"a1",
			"a2",
			"b",
		]);
	});

	it("hides a whole branch, grandchildren and all", () => {
		expect(ids(visibleReferenceRows(foldableRows, new Set(["0"])))).toEqual([
			"a",
			"b",
		]);
	});

	it("hides a fold nested inside a fold once, not twice", () => {
		expect(
			ids(visibleReferenceRows(foldableRows, new Set(["0", "0.0"]))),
		).toEqual(["a", "b"]);
	});

	it("hides nothing for a fold set naming rows that no longer exist", () => {
		// A key names a position, so a move or a removal renames it — and a set
		// left over from a tree that has changed must not hide a stranger.
		expect(
			ids(
				visibleReferenceRows(foldableRows, new Set(["9", "0.0.0.0", "gone"])),
			),
		).toEqual(["a", "a1", "a1x", "a1y", "a2", "b"]);
	});

	it("hides nothing for a folded Reference with no branch to hide", () => {
		expect(
			ids(visibleReferenceRows(foldableRows, new Set(["0.0.0", "1"]))),
		).toEqual(["a", "a1", "a1x", "a1y", "a2", "b"]);
	});

	it("answers with the caller's own entries, so a row's name travels back", () => {
		const shown = visibleReferenceRows(foldableRows, new Set(["0.0"]));
		expect(shown[1]).toBe(foldableRows[1]);
	});
});

/**
 * A tree four levels deep, with a sibling at every level for the ancestor
 * rules to walk past. Rows: "0", "1", "1.0", "1.1", "1.1.0", "1.1.0.0".
 */
const deepRows = readReferenceTree([
	{ id: "r0" },
	{
		id: "r1",
		children: [
			{ id: "n1" },
			{ id: "n2", children: [{ id: "m1", children: [{ id: "leaf" }] }] },
		],
	},
] satisfies Reference[]);

describe("referenceAncestorKeys", () => {
	it("finds none for a root, which sits inside nothing", () => {
		expect(referenceAncestorKeys(deepRows, 0)).toEqual([]);
	});

	it("names every ancestor of a row nested several levels deep", () => {
		// Nearest first: a caller opening its way down to a row reads them in
		// the order it meets them.
		expect(referenceAncestorKeys(deepRows, 5)).toEqual(["1.1.0", "1.1", "1"]);
	});

	it("names only ancestors, never a sibling or a sibling's branch", () => {
		// "1.0" is above the row and "0" is a root above it; neither contains it.
		expect(referenceAncestorKeys(deepRows, 4)).toEqual(["1.1", "1"]);
	});

	it("finds none for an index the list does not reach", () => {
		expect(referenceAncestorKeys(deepRows, 99)).toEqual([]);
		expect(referenceAncestorKeys(deepRows, -1)).toEqual([]);
	});
});

describe("referenceAncestorRows", () => {
	it("answers with the caller's own rows, so what a row carries travels back", () => {
		// The keys are the folding half; Find reads the same walk for the names
		// its results are placed by, and one walk is what keeps a path from
		// naming a route the folds do not take.
		expect(referenceAncestorRows(deepRows, 5)).toEqual([
			deepRows[4],
			deepRows[3],
			deepRows[1],
		]);
	});

	it("finds none for a root, or for an index the list does not reach", () => {
		expect(referenceAncestorRows(deepRows, 0)).toEqual([]);
		expect(referenceAncestorRows(deepRows, 99)).toEqual([]);
	});
});

describe("foldsToReveal", () => {
	it("names the folds standing between a row and being seen", () => {
		expect(foldsToReveal(deepRows, 5, new Set(["1", "1.1.0"]))).toEqual([
			"1.1.0",
			"1",
		]);
	});

	it("names none when every ancestor is already open", () => {
		// Revealing a row already on screen opens nothing, so an Author's own
		// folds elsewhere are left exactly as they are.
		expect(foldsToReveal(deepRows, 5, new Set())).toEqual([]);
	});

	it("names only the ancestors that are shut, not all of them", () => {
		expect(foldsToReveal(deepRows, 5, new Set(["1.1"]))).toEqual(["1.1"]);
	});

	it("names none for a root, which sits inside nothing", () => {
		expect(foldsToReveal(deepRows, 0, new Set(["1", "1.1"]))).toEqual([]);
	});

	it("leaves the revealed Reference's own fold shut", () => {
		// A Reveal brings the row into view; what hangs under it is the
		// Author's business, and opening it would move rows they never named.
		expect(foldsToReveal(deepRows, 4, new Set(["1.1.0"]))).toEqual([]);
	});

	it("ignores folds beside the row, and folds naming rows that no longer exist", () => {
		expect(foldsToReveal(deepRows, 5, new Set(["0", "1.0", "gone"]))).toEqual(
			[],
		);
	});
});

/**
 * A tree of exactly `size` References: one parent carrying a branch, and
 * leaves at the root for the rest — so the threshold can be walked a row at a
 * time, and there is always exactly one Reference with anything to fold.
 */
const treeOfSize = (size: number): Reference[] => {
	if (size <= 0) return [];
	if (size === 1) return [{ id: "solo" }];
	const roots: Reference[] = [{ id: "parent", children: [{ id: "child" }] }];
	for (let index = 2; index < size; index++) {
		roots.push({ id: `leaf-${String(index)}` });
	}
	return roots;
};

/** A tree past the threshold with folds at two levels — `foldable` and then
 * enough leaves to be worth collapsing. */
const big: Reference[] = [
	...foldable,
	...treeOfSize(REFERENCE_TREE_COLLAPSE_THRESHOLD),
];

describe("referenceTreeOpensFolded", () => {
	/** `size` rows, as a list — only the count is read. */
	const rowsOfSize = (size: number) => readReferenceTree(treeOfSize(size));

	it("says no at exactly the threshold", () => {
		expect(
			referenceTreeOpensFolded(rowsOfSize(REFERENCE_TREE_COLLAPSE_THRESHOLD)),
		).toBe(false);
	});

	it("says no one Reference below it", () => {
		expect(
			referenceTreeOpensFolded(
				rowsOfSize(REFERENCE_TREE_COLLAPSE_THRESHOLD - 1),
			),
		).toBe(false);
	});

	it("says yes one Reference above it", () => {
		expect(
			referenceTreeOpensFolded(
				rowsOfSize(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1),
			),
		).toBe(true);
	});

	it("says no about a tree with nothing in it", () => {
		expect(referenceTreeOpensFolded([])).toBe(false);
	});

	it("is the same answer the initial fold set is built from", () => {
		// One threshold, two behaviours: what decides that a tree opens folded
		// is what decides that it is worth carrying a Find control. A renderer
		// asking one question and the model answering the other is exactly the
		// disagreement this predicate exists to prevent.
		for (const size of [
			REFERENCE_TREE_COLLAPSE_THRESHOLD - 1,
			REFERENCE_TREE_COLLAPSE_THRESHOLD,
			REFERENCE_TREE_COLLAPSE_THRESHOLD + 1,
		]) {
			const rows = rowsOfSize(size);
			expect(initialReferenceFolds(rows).size > 0).toBe(
				referenceTreeOpensFolded(rows),
			);
		}
	});
});

describe("initialReferenceFolds", () => {
	it("builds trees of the size it was asked for", () => {
		// The threshold tests below are only worth anything if this is exact.
		expect(countReferences(treeOfSize(REFERENCE_TREE_COLLAPSE_THRESHOLD))).toBe(
			REFERENCE_TREE_COLLAPSE_THRESHOLD,
		);
	});

	it("folds nothing at exactly the threshold", () => {
		const rows = readReferenceTree(
			treeOfSize(REFERENCE_TREE_COLLAPSE_THRESHOLD),
		);
		expect([...initialReferenceFolds(rows)]).toEqual([]);
	});

	it("folds nothing one Reference below the threshold", () => {
		const rows = readReferenceTree(
			treeOfSize(REFERENCE_TREE_COLLAPSE_THRESHOLD - 1),
		);
		expect([...initialReferenceFolds(rows)]).toEqual([]);
	});

	it("folds every Reference with a branch one above the threshold", () => {
		// Only the parent: a leaf has nothing to fold away, and a fold set
		// naming one would say a row is shut that has nothing behind it.
		const rows = readReferenceTree(
			treeOfSize(REFERENCE_TREE_COLLAPSE_THRESHOLD + 1),
		);
		expect([...initialReferenceFolds(rows)]).toEqual(["0"]);
	});

	it("folds every parent at every level, not only the roots", () => {
		// `a` and `a1` both carry branches, three levels apart at the top of a
		// tree well past the threshold.
		const rows = readReferenceTree(big);
		expect([...initialReferenceFolds(rows)].sort()).toEqual(["0", "0.0", "2"]);
	});

	it("leaves the roots on screen — what the fold set opens to", () => {
		// The two rules together: a tree that opens collapsed shows its roots,
		// which is the whole point of the threshold.
		const rows = readReferenceTree(big);
		const shown = visibleReferenceRows(rows, initialReferenceFolds(rows));
		expect(shown.every((row) => row.depth === 0)).toBe(true);
		expect(ids(shown).slice(0, 3)).toEqual(["a", "b", "parent"]);
		// 21 roots: `foldable`'s two, and `treeOfSize`'s parent and 18 leaves.
		expect(shown).toHaveLength(21);
	});

	it("folds nothing in a tree with nothing in it", () => {
		expect([...initialReferenceFolds([])]).toEqual([]);
	});
});
