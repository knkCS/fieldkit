// src/schema/reference-find.ts
/**
 * **Find**: locating a Reference the tree already holds, by the name of the
 * Content it points at (CONTEXT.md).
 *
 * Matching happens here, in the browser, over the names resolved for every
 * Reference at every level — ADR-0013, which also records the four
 * alternatives rejected to reach it. The tree's contents are a closed set the
 * client already holds, so asking an Adapter about them means shipping that set
 * up the wire to ask a question about itself.
 *
 * It sits beside the tree model rather than in the control that lists results
 * for the same reason the fold and drag arithmetic does: two renderers of this
 * tree are to share one answer, and a rule each of them owned a copy of would
 * be a rule they were free to disagree about. Nothing here knows what a
 * dropdown is.
 */
import type { ReferenceRow } from "./reference-tree";
import { referenceAncestorRows, referenceDisplayName } from "./reference-tree";

/** One Reference that answered to a query, and where it sits. */
export interface ReferenceFindResult {
	/**
	 * The row's key — its index path, which is what a Reveal names.
	 *
	 * A key rather than an id, because the same Content may legitimately sit in
	 * one tree twice: two occurrences are two results, and an id could not tell
	 * a caller which of them an Author picked.
	 */
	key: string;
	/**
	 * The name it matched on: the resolved display name, or the id where no
	 * name resolved — which is exactly what the row shows.
	 */
	name: string;
	/**
	 * The names of the References it sits inside, **outermost first** — the
	 * path leading down to it.
	 *
	 * Empty for a root. It is what tells two results apart when the same
	 * Content sits in the tree twice, and it is why a result is worth showing
	 * on two lines: a name alone cannot say which occurrence it is.
	 *
	 * Outermost first, where the fold rules answer nearest first, because these
	 * are read rather than walked: an Author reads a path top-down, the
	 * direction the tree draws it.
	 */
	ancestors: string[];
}

/**
 * How many matches Find lists at once, however many it found.
 *
 * PROVISIONAL — a guess, not a measurement, on the same terms as the Reference
 * Tree's collapse threshold and the name-fetch batch size. Twenty is roughly a
 * screenful of dropdown rows, which is the point where a list stops being
 * something an Author scans and becomes the wall of names the tree already was
 * — and past it, another twenty candidates help nobody who can instead type one
 * more letter. Parent #143 says as much: this number and the batch size are
 * both numbers this repo has not yet earned, and the first Consumer to measure
 * one should change it here.
 *
 * Nothing above or below it fails in a way a test would catch, which is exactly
 * why it wants measuring against a real Spec: too low and an Author cannot see
 * an answer that was found for them, too high and they are handed the wall
 * back. The count beside the list is what keeps a wrong guess honest — an
 * Author reading "20 of 431" knows there is more, whatever the twenty is.
 */
export const REFERENCE_FIND_RESULT_CAP = 20;

/**
 * How well a name answered to a query, lowest first — a name that begins with
 * it, then one where a word within it begins with it, then one where it merely
 * appears.
 *
 * Numbers rather than a union, because the only thing ever asked of them is
 * which is smaller. They are private: a rank is how the order was arrived at,
 * and a caller that read one could disagree with the order it was given.
 */
const RANK_NAME_BEGINS = 0;
const RANK_WORD_BEGINS = 1;
const RANK_APPEARS_ANYWHERE = 2;

/**
 * Whether the text leading up to an occurrence ends mid-word.
 *
 * Letters, digits and combining marks by Unicode's own reckoning, so a name in
 * any script the Adapter resolves is read the way that script is written rather
 * than the way ASCII is. Everything else — a space, a hyphen, a slash, a
 * bracket — begins a word, which is what an Author means by typing the start of
 * one.
 *
 * Anchored at the end of the preceding text rather than testing one character
 * pulled out of it: a character outside the basic plane is two UTF-16 units, and
 * the trailing half of one on its own is a letter in no script at all. Matched
 * against the prefix, the engine reads whole code points, so a name in an astral
 * script is not quietly treated as starting a word in the middle of a letter.
 * Marks count as word characters for the same reason — a letter written as a
 * base plus its accent must not read as a word boundary between the two.
 */
const ENDS_MID_WORD = /[\p{L}\p{N}\p{M}]$/u;

/**
 * Every combining mark, which is what a decomposed accent becomes once its
 * letter has been separated from it.
 */
const COMBINING_MARKS = /\p{M}/gu;

/**
 * One text reduced to the letters an Author typing quickly would reach for:
 * lower-cased, `ß` spelled out, and every accent taken off the letter under it.
 *
 * An Author on a German keyboard searching for a Content they can see types
 * ASCII, because typing ASCII is faster than reaching for the umlaut key — so
 * "muller" has to answer "Müller". Folding both the query and the name is what
 * makes that true in both directions at once: fold only the name and "müller"
 * stops finding "Muller", which is the same Author a moment later reading the
 * same Reference as absent.
 *
 * Three steps, in this order and for these reasons:
 *
 * 1. **Lower-cased first**, so the capital sharp s "ẞ" arrives at the next step
 *    as "ß" and is spelled out with it rather than surviving as itself.
 * 2. **`ß` spelled "ss"** — in its own right, because no Unicode normalisation
 *    does it. `ß` is not an "s" with something on top; it is its own letter, so
 *    decomposition leaves it exactly as it found it. German content that is
 *    typed "Grosse" and stored "Große" is the ordinary case, not the exotic one.
 * 3. **Decomposed, then stripped of marks** — NFD breaks "ü" into a "u" and the
 *    diaeresis over it, and taking the marks away leaves the "u". Done this way
 *    round it needs no table of letters: whatever the Adapter resolves, in
 *    whatever script, loses its accents by the same rule.
 *
 * German folds its umlauts to bare vowels here, not to "ue"/"oe"/"ae". Both are
 * defensible spellings of the same intent and this one is the direction an
 * Author types when reading a name off the screen; the transliteration is the
 * direction they type when they cannot see it, which Find is not for.
 *
 * NFD rather than NFKD: an accent is what is being folded away, not the
 * difference between a ligature and the letters in it.
 */
export function foldReferenceText(text: string): string {
	return text
		.toLowerCase()
		.replace(/ß/g, "ss")
		.normalize("NFD")
		.replace(COMBINING_MARKS, "");
}

/**
 * How an already-folded `haystack` answered to an already-folded,
 * already-trimmed `needle`, or `null` if it did not answer at all.
 *
 * Both sides arrive folded rather than being folded here, so that a caller
 * asking one query of a thousand names folds that query once instead of a
 * thousand times, and so that a name a caller reads twice is folded once.
 *
 * Matching and ranking are one pass because they read the same thing: whether
 * the needle is in there is the question of whether it is in there *anywhere*,
 * which is the weakest rank. Splitting them would walk the name twice and let
 * the two walks disagree about what a match is.
 */
function referenceMatchRank(haystack: string, needle: string): number | null {
	const first = haystack.indexOf(needle);
	if (first < 0) return null;
	if (first === 0) return RANK_NAME_BEGINS;
	// Every later occurrence is worth looking at: the first one may sit inside
	// a word while a second starts one — "Bern in the world" answers "world"
	// on its last word, not on the "worl" of nothing.
	for (let at = first; at >= 0; at = haystack.indexOf(needle, at + 1)) {
		if (!ENDS_MID_WORD.test(haystack.slice(0, at))) return RANK_WORD_BEGINS;
	}
	return RANK_APPEARS_ANYWHERE;
}

/**
 * The best rank any of the texts a row answers on earned, or `null` where none
 * of them answered at all.
 *
 * A row answers on **two** texts: the name it shows, and the id behind it. Best
 * rather than first, so that which of the two a row is currently *showing*
 * cannot change where it lands — a Field whose Adapter is working ranks a
 * pasted id exactly as one whose Adapter failed does, which is the whole point
 * of matching ids at all.
 */
function bestMatchRank(
	haystacks: readonly string[],
	needle: string,
): number | null {
	let best: number | null = null;
	for (const haystack of haystacks) {
		const rank = referenceMatchRank(haystack, needle);
		if (rank !== null && (best === null || rank < best)) best = rank;
	}
	return best;
}

/** Everything one Find answered: what to list, and how much there was. */
export interface ReferenceFindAnswer {
	/** The matches to show. */
	results: ReferenceFindResult[];
	/**
	 * How many References matched in all.
	 *
	 * One answer carries both, so a control cannot list one question's matches
	 * beside another question's count — the two are computed once, from the same
	 * walk of the same tree, and can never disagree about it.
	 */
	total: number;
}

/**
 * The References in a tree whose display name contains `query`: the best
 * {@link REFERENCE_FIND_RESULT_CAP} of them, ranked, beside a count of how many
 * there were in all.
 *
 * **Ranked** — a name beginning with the query, then a name a word of which
 * begins with it, then a name merely containing it; ties broken by where the
 * row sits, top to bottom. Two matches never tie outright, so the order is
 * total: the same query over the same tree comes back the same way, and a list
 * an Author is reading does not rearrange itself under the next keystroke.
 *
 * **Capped**, and the cap is why `total` is here. Four hundred names is the
 * wall the tree already was, so Find lists twenty and says how many it found —
 * a control showing the length of its own list would tell an Author they had
 * seen everything.
 *
 * **A row answers on two texts**: the name it shows — `referenceDisplayName`,
 * so an id stands in wherever none resolved — and the id behind it, whether or
 * not a name did resolve. Ids match because a row whose Content no longer
 * resolves *displays* one, and an Author who can read an id off the screen can
 * paste it back in; Find matching what is in front of them rather than an
 * idealised tree is the whole of it (ADR-0013).
 *
 * It is ranked on the **best** of the two, never on the first to answer, so
 * that which text a row happens to be showing cannot move it: a Field whose
 * Adapter is working ranks a pasted id exactly as one whose Adapter failed
 * does. Two texts still make one result — a Reference cannot be Revealed twice.
 *
 * **Case-insensitive, and diacritic-folded on both sides** ({@link
 * foldReferenceText}), because an Author on a German keyboard reading a name
 * off the screen types ASCII: "muller" finds "Müller", "müller" finds "Muller",
 * and "grosse" and "Große" find each other. Folding sits *inside* the ranking
 * rather than beside it — a name beginning with the unaccented query is a name
 * that begins with the query — so the order above holds over folded matches
 * exactly as it holds over literal ones.
 *
 * A blank query answers with nothing rather than with everything — Find is
 * asked a question, and "all of them" is what the tree already says.
 *
 * Every row is searched, not the rows a fold set leaves on screen. A collapsed
 * branch hiding the answer is the whole problem Find exists for.
 *
 * Matching being fieldkit's, its rules are fieldkit's: a Consumer cannot
 * substitute its own collation, stemming or fuzzy index. ADR-0013 records that
 * as the price of a Find that behaves identically everywhere. One consequence
 * of that ADR is still outstanding: Find cannot yet tell "no match" from "not
 * resolved yet" (#152), which is the one an Author can be misled by — and the
 * one that makes a count of nought worth reading twice.
 */
export function findReferences(
	rows: readonly ReferenceRow[],
	names: Record<string, string>,
	query: string,
): ReferenceFindAnswer {
	const needle = foldReferenceText(query.trim());
	if (needle === "") return { results: [], total: 0 };
	const matched: {
		rank: number;
		index: number;
		row: ReferenceRow;
		name: string;
	}[] = [];
	rows.forEach((row, index) => {
		// Resolved once and carried: the name a result shows is the name it was
		// ranked on, so no second lookup can hand an Author a row that answers to
		// a query its own label does not contain.
		const name = referenceDisplayName(row, names);
		const id = row.reference.id;
		// Folded once each, here, so a keystroke costs one fold per text in the
		// tree — never one per occurrence of the needle within a name, and never
		// one fold of the query per row.
		//
		// A row whose Content did not resolve shows its id, so its two texts are
		// the same text; folding it twice would double the cost of precisely the
		// case that pays it on every row at once, a Field whose Adapter failed.
		const rank = bestMatchRank(
			name === id
				? [foldReferenceText(id)]
				: [foldReferenceText(name), foldReferenceText(id)],
			needle,
		);
		if (rank === null) return;
		// The *name*, never whichever text answered: an id that matched is how a
		// row was reached, and a result labelled with it would read as a
		// different Reference from the row it names.
		matched.push({ rank, index, row, name });
	});
	// Rank first, then the row's own position. Both are compared explicitly
	// rather than leaning on a stable sort to carry the second: the ordering
	// being *total* is the point — no two matches share a position, so no two
	// are ever tied, and the same query over the same tree can only ever come
	// back in one order.
	matched.sort((a, b) => a.rank - b.rank || a.index - b.index);
	return {
		// Every match, not the ones listed: it is what tells an Author to keep
		// typing rather than to read the cap as the whole answer.
		total: matched.length,
		// Cut after the ranking, so what survives is the best of what was found
		// rather than the first of it — and before the ancestor walks, so a
		// query answering four hundred times climbs twenty paths, not four
		// hundred.
		results: matched
			.slice(0, REFERENCE_FIND_RESULT_CAP)
			.map(({ row, index, name }) => ({
				key: row.key,
				name,
				// The tree model's own ancestor walk, reversed into reading order —
				// the same rule `foldsToReveal` reads, so the path a result shows can
				// never name a route different from the folds picking it opens.
				ancestors: referenceAncestorRows(rows, index)
					.map((ancestor) => referenceDisplayName(ancestor, names))
					.reverse(),
			})),
	};
}
