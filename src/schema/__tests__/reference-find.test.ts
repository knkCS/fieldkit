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
import { findReferences, REFERENCE_FIND_RESULT_CAP } from "../reference-find";
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
const keys = (answer: { results: { key: string }[] }) =>
	answer.results.map((r) => r.key);

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

	it("answers with nothing for a blank query", () => {
		expect(findReferences(rows, names, "").results).toEqual([]);
		expect(findReferences(rows, names, "   ").results).toEqual([]);
	});

	it("ignores the whitespace around a query", () => {
		expect(keys(findReferences(rows, names, "  Bern "))).toEqual(["0.0"]);
	});

	it("answers with nothing when the query matches no name in the tree", () => {
		expect(findReferences(rows, names, "Pyrenees").results).toEqual([]);
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
		expect(
			findReferences(rows, { ...names, cats: "Felines" }, "cats").results,
		).toEqual([]);
	});

	it("carries the name it matched, so a result can be shown without a second lookup", () => {
		expect(findReferences(rows, names, "Bern").results[0].name).toBe(
			"Bern in the world",
		);
	});

	it("finds nothing in a tree with nothing in it", () => {
		expect(findReferences([], names, "Alps").results).toEqual([]);
	});
});

/**
 * Four ways a name can answer to "berg", planted in the tree in exactly the
 * wrong order: the weakest match at the top and the strongest at the bottom, so
 * an answer that merely walked the tree cannot pass. Rows: "0", "0.0", "1", "2".
 */
const bergs = readReferenceTree([
	{ id: "ice", children: [{ id: "sand" }] },
	{ id: "cold" },
	{ id: "bergen" },
] satisfies Reference[]);

const bergNames: Record<string, string> = {
	ice: "Iceberg survey",
	sand: "Sandberg quarry",
	cold: "Cold berg valley",
	bergen: "Bergen harbour",
};

describe("findReferences — how the matches are ranked", () => {
	it("ranks a name beginning with the query first, then a word beginning with it, then one merely containing it", () => {
		expect(keys(findReferences(bergs, bergNames, "berg"))).toEqual([
			"2", // "Bergen harbour"  — the name begins with it
			"1", // "Cold berg valley" — a word within the name begins with it
			"0", // "Iceberg survey"  — it appears somewhere inside
			"0.0", // "Sandberg quarry" — likewise, and further down the tree
		]);
	});

	it("breaks a tie by the row's position in the tree, across branches", () => {
		// Only "Cats of the world" has a word beginning with the query, so it
		// leads; the three that merely contain it follow in the order the rows
		// are drawn — depth-first, so a root in the second branch comes after a
		// grandchild in the first.
		expect(keys(findReferences(rows, names, "o"))).toEqual([
			"0.0.0",
			"0",
			"0.0",
			"1",
		]);
	});

	it("counts a word beginning after punctuation as a word beginning", () => {
		// A hyphen, a bracket or a slash is where an Author sees one word end
		// and the next start, whatever a letter-only reading would say.
		const punctuated = readReferenceTree([
			{ id: "ice" },
			{ id: "bracketed" },
			{ id: "hyphenated" },
		] satisfies Reference[]);

		expect(
			keys(
				findReferences(
					punctuated,
					{
						ice: "Iceberg survey",
						bracketed: "Survey (berg edition)",
						hyphenated: "Cold-berg valley",
					},
					"berg",
				),
			),
		).toEqual(["1", "2", "0"]);
	});

	it("reads a letter as one letter, however many pieces it is written in", () => {
		// "𝐀" is a single letter JavaScript stores as two units, and "é" here is
		// an "e" with its accent written separately. Either way what sits against
		// the query is the middle of a word, and neither name may be promoted
		// above one that really does begin a word with it.
		const written = readReferenceTree([
			{ id: "astral" },
			{ id: "combined" },
			{ id: "cold" },
		] satisfies Reference[]);

		expect(
			keys(
				findReferences(
					written,
					{
						astral: "\u{1D400}berg survey",
						// "e" plus a combining acute, written out: the precomposed
						// "é" is a letter all by itself and would prove nothing.
						combined: "Cafe\u0301berg quarry",
						cold: "Cold berg valley",
					},
					"berg",
				),
			),
		).toEqual(["2", "0", "1"]);
	});

	it("leaves the tree it was handed untouched, so the next query answers like the first", () => {
		// The ranking sorts what it collected, never the caller's rows — a
		// control whose tree came back reordered would answer the same query
		// differently the second time.
		const before = rows.map((row) => row.key);

		findReferences(rows, names, "o");

		expect(rows.map((row) => row.key)).toEqual(before);
		expect(keys(findReferences(rows, names, "o"))).toEqual([
			"0.0.0",
			"0",
			"0.0",
			"1",
		]);
	});

	it("leaves no two results tied, so the list cannot reshuffle between keystrokes", () => {
		// "Shared article" sits in this tree twice: one name, so one rank, and
		// what separates them is where they sit. A tie the ordering did not
		// break is a pair a later sort would be free to swap.
		expect(keys(findReferences(rows, names, "Shared article"))).toEqual([
			"0.1",
			"1.0",
		]);
	});
});

describe("findReferences — one answer", () => {
	it("answers with the matches and how many were found, together", () => {
		// One call, one answer: a control cannot show a list from one question
		// and a count from another, so the two can never disagree.
		const found = findReferences(rows, names, "world");

		expect(keys(found)).toEqual(["0", "0.0", "0.0.0"]);
		expect(found.total).toBe(3);
	});

	it("counts nothing found for a query that matches nothing", () => {
		expect(findReferences(rows, names, "Pyrenees").total).toBe(0);
		expect(findReferences(rows, names, "").total).toBe(0);
	});
});

/**
 * A flat tree of `count` References whose names all answer to "peak" the same
 * way, so the only thing deciding what comes back is the cap.
 *
 * Sized from {@link REFERENCE_FIND_RESULT_CAP} at each call site rather than
 * from a number copied beside it: these assertions walk whatever cap this repo
 * currently holds, and a cap someone raises tomorrow is still walked at its own
 * edges rather than at yesterday's.
 */
function peaks(count: number) {
	const tree = Array.from({ length: count }, (_, index) => ({
		id: `peak-${index + 1}`,
	}));
	return {
		rows: readReferenceTree(tree satisfies Reference[]),
		names: Object.fromEntries(
			tree.map((reference, index) => [reference.id, `Peak ${index + 1}`]),
		),
	};
}

describe("findReferences — the cap on how many are listed", () => {
	it("lists them all, one below the cap", () => {
		const { rows: peakRows, names: peakNames } = peaks(
			REFERENCE_FIND_RESULT_CAP - 1,
		);

		const found = findReferences(peakRows, peakNames, "peak");

		expect(found.results).toHaveLength(REFERENCE_FIND_RESULT_CAP - 1);
		expect(found.total).toBe(REFERENCE_FIND_RESULT_CAP - 1);
	});

	it("lists them all at exactly the cap, withholding none", () => {
		const { rows: peakRows, names: peakNames } = peaks(
			REFERENCE_FIND_RESULT_CAP,
		);

		const found = findReferences(peakRows, peakNames, "peak");

		expect(found.results).toHaveLength(REFERENCE_FIND_RESULT_CAP);
		expect(found.total).toBe(REFERENCE_FIND_RESULT_CAP);
	});

	it("lists the cap's worth one above it, and still counts them all", () => {
		const { rows: peakRows, names: peakNames } = peaks(
			REFERENCE_FIND_RESULT_CAP + 1,
		);

		const found = findReferences(peakRows, peakNames, "peak");

		expect(found.results).toHaveLength(REFERENCE_FIND_RESULT_CAP);
		// What an Author is told to keep typing about: how many there were,
		// never how many are on screen.
		expect(found.total).toBe(REFERENCE_FIND_RESULT_CAP + 1);
	});

	it("caps what it ranked, not what the tree held", () => {
		// A cap's worth that merely contain the query, and — last row of all —
		// one whose name begins with it. Applied before the ranking, the cap
		// would drop precisely the match an Author was most likely after.
		const inside = Array.from(
			{ length: REFERENCE_FIND_RESULT_CAP },
			(_, index) => ({ id: `ice-${index + 1}` }),
		);
		const peakRows = readReferenceTree([
			...inside,
			{ id: "district" },
		] satisfies Reference[]);
		const peakNames: Record<string, string> = {
			district: "Peak district",
			...Object.fromEntries(
				inside.map((reference, index) => [
					reference.id,
					`Icepeak ${index + 1}`,
				]),
			),
		};

		const found = findReferences(peakRows, peakNames, "peak");

		expect(found.results[0].name).toBe("Peak district");
		expect(found.results).toHaveLength(REFERENCE_FIND_RESULT_CAP);
		expect(found.total).toBe(REFERENCE_FIND_RESULT_CAP + 1);
		// What fell off the end is the weakest match, not the last one listed.
		expect(found.results.map((result) => result.name)).not.toContain(
			`Icepeak ${REFERENCE_FIND_RESULT_CAP}`,
		);
	});
});

/** The ancestors whatever Find answered with, one list per result. */
const paths = (answer: { results: { ancestors: string[] }[] }) =>
	answer.results.map((r) => r.ancestors);

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
		expect(findReferences(rows, names, "Shared").results[0].ancestors).toEqual([
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
		expect(
			findReferences(orphaned, names, "Cats").results[0].ancestors,
		).toEqual(["vanished"]);
	});
});
