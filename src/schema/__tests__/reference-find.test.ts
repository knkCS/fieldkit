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
import {
	findReferences,
	foldReferenceText,
	REFERENCE_FIND_RESULT_CAP,
} from "../reference-find";
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

	it("matches a Reference by its id even where the name resolved", () => {
		// "cats" is the id behind a Content named something else entirely. An
		// Author reaches an id by pasting one off a row, and whether that row
		// happens to be showing a name is not something they can act on: a
		// Field with a working Adapter has to answer an id exactly as one whose
		// Adapter failed does.
		expect(
			keys(findReferences(rows, { ...names, cats: "Felines" }, "cats")),
		).toEqual(["0.0.0"]);
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
 * Two Contents from one catalogue, told apart only by their ids — and only the
 * first of them resolved. Whether a row is showing a name or an id is the
 * difference this fixture exists to prove Find does *not* make.
 */
const acme = readReferenceTree([
	{ id: "acme-42" },
	{ id: "acme-43" },
] satisfies Reference[]);

describe("findReferences — matching the id a row may be showing", () => {
	it("answers an id the same whether the name resolved or not", () => {
		// The one criterion an Author can actually check: they read an id off a
		// broken row, paste it, and the tree either contains that Reference or
		// it does not. A rule that answered only for the unresolved row would
		// make Find's behaviour depend on the Adapter's health, which is the
		// thing it is supposed to survive.
		expect(
			keys(findReferences(acme, { "acme-42": "Widget" }, "acme-4")),
		).toEqual(["0", "1"]);
	});

	it("answers the same query identically when the Adapter resolved nothing at all", () => {
		// A total Adapter failure is the degrade ADR-0013 describes, and it must
		// change the ranking as well as the matching by nothing whatsoever.
		expect(keys(findReferences(acme, {}, "acme-4"))).toEqual(["0", "1"]);
	});

	it("ignores case on an id, on both sides", () => {
		const mixed = readReferenceTree([{ id: "ACME-42" }] satisfies Reference[]);

		expect(
			keys(findReferences(acme, { "acme-42": "Widget" }, "ACME-42")),
		).toEqual(["0"]);
		expect(keys(findReferences(mixed, {}, "acme-42"))).toEqual(["0"]);
	});

	it("folds an id by the same rule it folds a name", () => {
		// One rule, so a Consumer whose ids are slugs cut from the display name
		// does not meet two different Finds in one control.
		const slugs = readReferenceTree([
			{ id: "müller-verlag" },
		] satisfies Reference[]);

		expect(keys(findReferences(slugs, {}, "muller"))).toEqual(["0"]);
	});

	it("labels a result matched on its id with the name the row shows", () => {
		// The id is how the row was reached, not what it is called. A result
		// wearing the id would read as a different Reference from the row it
		// names — which is the confusion an Author pasting an id is trying to
		// get out of.
		const found = findReferences(acme, { "acme-42": "Widget" }, "acme-42");

		expect(found.results[0].name).toBe("Widget");
	});

	it("ranks a row on its id as highly as a failed Adapter would have", () => {
		// A row is ranked on the *best* of the two texts it answers on, not on
		// the first of them to answer. "acme-42" begins with the query, while
		// the name the Adapter resolved for it merely has a word beginning with
		// it — so reading the name first would demote a Reference precisely
		// because its Adapter was working, and an Author pasting an id would
		// find it ranked differently on a good day and a bad one.
		const catalogue = readReferenceTree([
			{ id: "acme-42" },
			{ id: "zebra" },
		] satisfies Reference[]);

		// Both are prefix matches — one on its id, one on its name — so nothing
		// separates them but where they sit.
		expect(
			keys(
				findReferences(
					catalogue,
					{ "acme-42": "Widget acme-42", zebra: "Acme catalogue" },
					"acme",
				),
			),
		).toEqual(["0", "1"]);
		// Which is the order the same tree comes back in when the Adapter never
		// resolved that row at all.
		expect(
			keys(findReferences(catalogue, { zebra: "Acme catalogue" }, "acme")),
		).toEqual(["0", "1"]);
	});

	it("gives one result for a row whose name and id both answer", () => {
		// Two texts, one row: a Reference cannot be Revealed twice, and a list
		// naming it twice would be two results an Author has to tell apart with
		// nothing to tell them apart by.
		const both = readReferenceTree([{ id: "atlas" }] satisfies Reference[]);

		const found = findReferences(
			both,
			{ atlas: "Atlas of the world" },
			"atlas",
		);

		expect(keys(found)).toEqual(["0"]);
		expect(found.total).toBe(1);
	});
});

describe("foldReferenceText", () => {
	it("lower-cases, spells ß out, and takes the accents off", () => {
		// The three steps, asserted where they can be read rather than only
		// through a match: what a query and a name are both reduced to before
		// either is compared to the other.
		expect(foldReferenceText("Müller")).toBe("muller");
		expect(foldReferenceText("Große Straße")).toBe("grosse strasse");
		expect(foldReferenceText("STRAẞE")).toBe("strasse");
	});

	it("leaves a text that has nothing to fold exactly as it was", () => {
		expect(foldReferenceText("acme-42")).toBe("acme-42");
		expect(foldReferenceText("")).toBe("");
	});

	it("is idempotent, so a folded text folds to itself", () => {
		// What makes it safe to fold each of a row's texts once and compare them
		// with a query folded once: neither side can be more folded than the
		// other.
		const once = foldReferenceText("Große Müller Straße");

		expect(foldReferenceText(once)).toBe(once);
	});
});

describe("findReferences — folding a query against the name", () => {
	it("matches a name carrying diacritics from a query without them", () => {
		const german = readReferenceTree([{ id: "m" }] satisfies Reference[]);

		expect(keys(findReferences(german, { m: "Müller" }, "muller"))).toEqual([
			"0",
		]);
	});

	it("matches a name without diacritics from a query carrying them", () => {
		// The other direction is the same Author a moment later: one that folded
		// only the name would answer here and not there, which reads as the
		// Reference coming and going.
		const german = readReferenceTree([{ id: "m" }] satisfies Reference[]);

		expect(keys(findReferences(german, { m: "Muller" }, "müller"))).toEqual([
			"0",
		]);
	});

	it("matches ß from a query spelling it ss, and ss from a query spelling it ß", () => {
		// The one fold no normalisation performs: ß is a letter of its own, not
		// an s wearing something, so decomposition leaves it exactly as it is.
		const sharp = readReferenceTree([
			{ id: "sharp" },
			{ id: "spelled" },
		] satisfies Reference[]);
		const sharpNames = { sharp: "Große Straße", spelled: "Grosse Strasse" };

		// Either spelling of the query reaches both spellings of the name.
		expect(keys(findReferences(sharp, sharpNames, "grosse"))).toEqual([
			"0",
			"1",
		]);
		expect(keys(findReferences(sharp, sharpNames, "große"))).toEqual([
			"0",
			"1",
		]);
	});

	it("folds every diacritic German content actually carries, not one of them", () => {
		// One representative umlaut proves the mechanism and nothing about the
		// alphabet: a fold written as a table of letters is exactly as good as
		// the table, and the letters left out are the ones a Consumer's
		// catalogue turns out to be full of. So the whole set an Author working
		// in German meets is walked — the umlauts in both cases, the sharp s in
		// both cases, and the accents that arrive on the loanwords and surnames
		// a German catalogue is full of.
		const folds: [typed: string, stored: string][] = [
			["bäcker", "Backer"],
			["koln", "Köln"],
			["muller", "Müller"],
			["Ärzte", "Arzte"],
			["osterreich", "Österreich"],
			["ubersicht", "Übersicht"],
			["grosse", "Große"],
			// The capital sharp s, which all-caps German titles really do use and
			// which lower-casing has to reach before the ss rule can.
			["strasse", "STRAẞE"],
			["cafe", "Café"],
			["creme", "Crème"],
			["fete", "Fête"],
			["a la carte", "à la carte"],
			["facade", "Façade"],
			["jalapeno", "Jalapeño"],
			["citroen", "Citroën"],
			// An Adapter may resolve a name written base-plus-mark rather than
			// precomposed. The two are the same word, and read identically on
			// screen, so Find cannot tell them apart either. Written out as an
			// escape, because a precomposed \u00fc here would only prove the row
			// above a second time — and nothing in the file may quietly normalise it.
			["muller", "Mu\u0308ller"],
			["mu\u0308ller", "M\u00fcller"],
		];

		// Each pair is tried in both directions — an Author who types the
		// diacritic and one who does not must reach the same Reference — and the
		// ones that answered neither way are named, so a failure says which
		// letter was missed rather than that some letter was.
		const missed = folds.filter(([typed, stored]) => {
			const row = readReferenceTree([{ id: "x" }] satisfies Reference[]);
			return (
				findReferences(row, { x: stored }, typed).results.length === 0 ||
				findReferences(row, { x: typed }, stored).results.length === 0
			);
		});

		expect(missed).toEqual([]);
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

	it("ranks a folded match exactly as it ranks an unfolded one", () => {
		// Folding is inside the ranking, not beside it. A name beginning with
		// the unaccented query is a name that begins with the query — an answer
		// that folded only to decide *whether* a name matched would rank all
		// three of these alike and hand an Author the wrong one first.
		// Planted weakest-first, so walking the tree cannot pass.
		const muellers = readReferenceTree([
			{ id: "gross" },
			{ id: "alte" },
			{ id: "verlag" },
		] satisfies Reference[]);

		const found = findReferences(
			muellers,
			{
				gross: "Großmüller AG", // "muller" only appears inside it
				alte: "Alte Müller Straße", // a word within it begins with "muller"
				verlag: "Müller Verlag", // the name begins with "muller"
			},
			"muller",
		);

		expect(keys(found)).toEqual(["2", "1", "0"]);
		// And what comes back is the name the row shows, diacritics and all —
		// folding decides the match, never what an Author reads.
		expect(found.results[0].name).toBe("Müller Verlag");
	});

	it("reads the word boundary out of the folded text, not the name it was folded from", () => {
		// Folding changes a name's length — "Straße" spells out one letter
		// longer than it is written — so an offset found in the folded text
		// names a different place in the original. Here "muller" begins a word
		// eight characters into "strasse muller" and lands mid-word eight
		// characters into "Straße Müller", so a rank read off the unfolded name
		// demotes a genuine word-beginning to a mere appearance.
		const strasse = readReferenceTree([
			{ id: "inside" },
			{ id: "begins" },
		] satisfies Reference[]);

		expect(
			keys(
				findReferences(
					strasse,
					{ inside: "Großmüller AG", begins: "Straße Müller" },
					"muller",
				),
			),
			// The word-beginning leads, though it sits below in the tree.
		).toEqual(["1", "0"]);
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

/**
 * How many times `run` folded a text.
 *
 * Folding is the one step in a match that touches Unicode, and `normalize` is
 * the only thing that does — so counting the calls counts the folds, without
 * the module having to expose a counter it would otherwise have no reason to
 * have. Restored before anything is asserted, so an assertion's own string
 * handling cannot be counted as a fold.
 */
function foldsDuring(run: () => void): number {
	const normalize = String.prototype.normalize;
	let folds = 0;
	String.prototype.normalize = function (this: string, ...args) {
		folds += 1;
		return normalize.apply(this, args);
	};
	try {
		run();
	} finally {
		String.prototype.normalize = normalize;
	}
	return folds;
}

/** A tree of `count` rows, each with a resolved name and an id unlike it. */
function resolvedRows(count: number, name: (index: number) => string) {
	const tree = Array.from({ length: count }, (_, index) => ({
		id: `id-${index + 1}`,
	}));
	return {
		rows: readReferenceTree(tree satisfies Reference[]),
		names: Object.fromEntries(
			tree.map((reference, index) => [reference.id, name(index)]),
		),
	};
}

describe("findReferences — what a keystroke costs", () => {
	it("folds the query once and each of a row's texts once", () => {
		// The whole cost of folding, stated: one fold for the query, and one for
		// each text a row answers on. Folding the query inside the loop instead
		// would multiply the query's cost by the size of the tree — which is
		// exactly the scaling the match itself did not have.
		const { rows: ten, names: tenNames } = resolvedRows(10, (i) => `Peak ${i}`);

		const folds = foldsDuring(() => findReferences(ten, tenNames, "peak"));

		expect(folds).toBe(1 + 2 * ten.length);
	});

	it("folds no more often for a query that occurs in a name fifty times", () => {
		// Ranking looks at every occurrence of the needle to find one that
		// begins a word. Folding inside that walk would make a keystroke's cost
		// depend on how repetitive the names are — worse scaling than the
		// unfolded match ever had, and worst on exactly the trees Find is for.
		//
		// Every "ab" here sits behind a "z", so none of them begins a word and
		// the walk runs to the end of the name rather than stopping at the
		// first — which is the only shape in which the walk's cost is visible.
		const repetitive = resolvedRows(10, () => "zab".repeat(50));

		const folds = foldsDuring(() =>
			findReferences(repetitive.rows, repetitive.names, "ab"),
		);

		expect(folds).toBe(1 + 2 * repetitive.rows.length);
	});

	it("folds twice as often for twice as many rows, and no worse", () => {
		// Linear in the tree, which is what the match already was. The two
		// counts are read from real calls rather than predicted, so a fold that
		// grew with the square of the tree would show up here as the answer
		// disagreeing with the doubling.
		const { rows: ten, names: tenNames } = resolvedRows(10, (i) => `Peak ${i}`);
		const { rows: twenty, names: twentyNames } = resolvedRows(
			20,
			(i) => `Peak ${i}`,
		);

		const forTen = foldsDuring(() => findReferences(ten, tenNames, "peak"));
		const forTwenty = foldsDuring(() =>
			findReferences(twenty, twentyNames, "peak"),
		);

		// Minus the query, which is folded once whatever the tree costs.
		expect(forTwenty - 1).toBe(2 * (forTen - 1));
	});

	it("folds an unresolved row once, because its name is its id", () => {
		// A row whose Content did not resolve shows its id, so its two texts are
		// one text. Folding it twice would double the cost of exactly the case
		// that pays it across every row at once — a Field whose Adapter failed.
		const unresolved = readReferenceTree(
			Array.from({ length: 10 }, (_, index) => ({
				id: `id-${index + 1}`,
			})) satisfies Reference[],
		);

		const folds = foldsDuring(() => findReferences(unresolved, {}, "id"));

		expect(folds).toBe(1 + unresolved.length);
	});
});
