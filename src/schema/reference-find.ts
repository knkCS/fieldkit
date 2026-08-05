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
 * How `name` answered to an already-lowercased, already-trimmed `needle`, or
 * `null` if it did not answer at all.
 *
 * Matching and ranking are one pass because they read the same thing: whether
 * the needle is in there is the question of whether it is in there *anywhere*,
 * which is the weakest rank. Splitting them would walk the name twice and let
 * the two walks disagree about what a match is.
 */
function referenceMatchRank(name: string, needle: string): number | null {
	const haystack = name.toLowerCase();
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
 * What it matches is what a row *shows* — `referenceDisplayName`, so an id
 * stands in wherever no name resolved. That is Find degrading exactly as the
 * rows already do (ADR-0013): with no Adapter, or after a failed lookup, an id
 * is the name on screen, and a control that could not find what is on screen
 * would be lying about the tree. It is not the same as matching an id
 * *alongside* a resolved name, which is #151's.
 *
 * A blank query answers with nothing rather than with everything — Find is
 * asked a question, and "all of them" is what the tree already says.
 *
 * Every row is searched, not the rows a fold set leaves on screen. A collapsed
 * branch hiding the answer is the whole problem Find exists for.
 *
 * **Case-insensitive substring, and nothing else yet.** ADR-0013's matching
 * rules go further — diacritics folded, ids matched as well as names — and
 * this is a slice of them, not a disagreement with the record: #151 carries the
 * folding and the ids. Two more consequences of that ADR are likewise still
 * outstanding: names arrive unbatched (#147), and Find cannot yet tell "no
 * match" from "not resolved yet" (#152), which is the one an Author can be
 * misled by — and the one that makes a count of nought worth reading twice.
 */
export function findReferences(
	rows: readonly ReferenceRow[],
	names: Record<string, string>,
	query: string,
): ReferenceFindAnswer {
	const needle = query.trim().toLowerCase();
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
		const rank = referenceMatchRank(name, needle);
		if (rank === null) return;
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
