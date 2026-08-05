// src/schema/__tests__/reference-find.test.ts
/**
 * Find: which References in a tree answer to a name an Author typed, and where
 * each of them sits.
 *
 * Plain assertions over data, no React and no DOM — the same shape the tree
 * model's own suite takes, and for the same reason: matching and ancestor-path
 * construction are arithmetic over rows, and arithmetic asserted through a
 * rendered dropdown is arithmetic nobody can read.
 */
import { describe, expect, it } from "vitest";
import type { Reference } from "../reference";
import { findReferences } from "../reference-find";
import { readReferenceTree } from "../reference-tree";

/**
 * A tree with something to find at every level, the same Content in two
 * places, and one Reference whose Content does not resolve.
 *
 * Read through `readReferenceTree` rather than hand-built, so the keys a result
 * names are the keys a control actually holds. Rows, top to bottom: "0", "0.0",
 * "0.0.0", "0.1", "1", "1.0", "2".
 */
const tree: Reference[] = [
	{
		id: "alps",
		children: [{ id: "bern", children: [{ id: "cats" }] }, { id: "shared" }],
	},
	{ id: "dolomites", children: [{ id: "shared" }] },
	{ id: "vanished" },
];

const rows = readReferenceTree(tree);

/** What the Adapter resolved — `vanished` is deliberately absent from it. */
const names: Record<string, string> = {
	alps: "World atlas",
	bern: "Bern in the world",
	cats: "Cats of the world",
	dolomites: "Dolomite peaks",
	shared: "Shared article",
};

/** The keys whatever Find answered with, in the order it answered. */
const keys = (results: { key: string }[]) => results.map((r) => r.key);

describe("findReferences — what matches", () => {
	it("finds the References whose display name contains the query", () => {
		expect(keys(findReferences(rows, names, "Cats"))).toEqual(["0.0.0"]);
	});

	it("ignores case on both sides", () => {
		expect(keys(findReferences(rows, names, "cATS OF"))).toEqual(["0.0.0"]);
	});

	it("finds References at every level, not only the rows a fold leaves on screen", () => {
		// A root, its child and its grandchild. A tree past the collapse
		// threshold opens showing only the first of the three, and Find answers
		// with all of them: the tree it searches is the whole tree.
		expect(keys(findReferences(rows, names, "world"))).toEqual([
			"0",
			"0.0",
			"0.0.0",
		]);
	});

	it("answers in the order the tree holds them, across branches", () => {
		// Depth-first, so a root in the second branch follows a grandchild in
		// the first — the order the rows are drawn in, which is the order an
		// Author reads the results against.
		expect(keys(findReferences(rows, names, "o"))).toEqual([
			"0",
			"0.0",
			"0.0.0",
			"1",
		]);
	});

	it("answers with nothing for a blank query", () => {
		expect(findReferences(rows, names, "")).toEqual([]);
		expect(findReferences(rows, names, "   ")).toEqual([]);
	});

	it("ignores the whitespace around a query", () => {
		expect(keys(findReferences(rows, names, "  Bern "))).toEqual(["0.0"]);
	});

	it("answers with nothing when the query matches no name in the tree", () => {
		expect(findReferences(rows, names, "Pyrenees")).toEqual([]);
	});

	it("matches the id of a Reference whose Content did not resolve", () => {
		// A row with no resolved name shows its id, so Find matches what is on
		// screen — the degrade ADR-0013 describes, not id matching.
		expect(keys(findReferences(rows, names, "vanish"))).toEqual(["2"]);
	});

	it("does not match a resolved Reference by its id", () => {
		// "cats" is the id behind a Content named something else entirely.
		// Matching ids alongside names is a later ticket; this says where the
		// line currently is.
		expect(findReferences(rows, { ...names, cats: "Felines" }, "cats")).toEqual(
			[],
		);
	});

	it("carries the name it matched, so a result can be shown without a second lookup", () => {
		expect(findReferences(rows, names, "Bern")[0].name).toBe(
			"Bern in the world",
		);
	});

	it("finds nothing in a tree with nothing in it", () => {
		expect(findReferences([], names, "Alps")).toEqual([]);
	});
});

/** The ancestors whatever Find answered with, one list per result. */
const paths = (results: { ancestors: string[] }[]) =>
	results.map((r) => r.ancestors);

describe("findReferences — where each match sits", () => {
	it("gives a root no ancestors, because it sits inside nothing", () => {
		expect(paths(findReferences(rows, names, "atlas"))).toEqual([[]]);
	});

	it("names every Reference a match sits inside, outermost first", () => {
		// The path an Author reads top-down, the way the tree draws it: the
		// root first and the Reference's own parent last.
		expect(paths(findReferences(rows, names, "Cats"))).toEqual([
			["World atlas", "Bern in the world"],
		]);
	});

	it("names only ancestors, never a sibling or a sibling's branch", () => {
		// "0.1" sits under the root beside "0.0", whose branch it is not in.
		expect(findReferences(rows, names, "Shared")[0].ancestors).toEqual([
			"World atlas",
		]);
	});

	it("tells the same Content in two places apart by its path", () => {
		// Two occurrences are two results — which is the whole reason a result
		// is keyed by where it sits rather than by what it points at.
		const found = findReferences(rows, names, "Shared");
		expect(keys(found)).toEqual(["0.1", "1.0"]);
		expect(paths(found)).toEqual([["World atlas"], ["Dolomite peaks"]]);
	});

	it("shows an unresolved ancestor's id, exactly as the row above shows it", () => {
		// `names` has nothing for `vanished`, so the row above draws its id —
		// and the path has to say the same thing the tree does.
		const orphaned = readReferenceTree([
			{ id: "vanished", children: [{ id: "cats" }] },
		] satisfies Reference[]);
		expect(findReferences(orphaned, names, "Cats")[0].ancestors).toEqual([
			"vanished",
		]);
	});
});
