// src/renderer/fields/reference-find.tsx
import { useCallback } from "react";
import type {
	ReferenceFindAnswer,
	ReferenceFindResult,
	ReferenceFindState,
} from "../../schema/reference-find";
import { findReferences } from "../../schema/reference-find";
import type { ReferenceRow } from "../../schema/reference-tree";
import { SearchCombobox } from "../search-combobox";

/**
 * How a result's ancestors are read out as one line.
 *
 * A separator rather than a nesting glyph: the line is read aloud as well as
 * looked at, and a chevron is announced as punctuation or not at all.
 */
const PATH_SEPARATOR = " / ";

/**
 * What a number of matches is worth, where the names behind it are not all in.
 *
 * Appended rather than replacing the count: what Find *did* find is true in
 * every state — a listed match is a Reference that is in this tree — and it is
 * only the completeness of the number that changes. So an Author reads the same
 * sentence they always did, with the reservation on the end of it.
 *
 * Two reservations, because they ask for different things. Names still arriving
 * will answer on their own, so the sentence says to wait; names that failed
 * will not, so it says what is missing instead of implying patience will fix
 * it. Neither is a state of its own — see {@link ReferenceFindState}, which has
 * three and only three, one sentence apiece.
 */
const RESERVATIONS: Record<ReferenceFindState, string> = {
	complete: "",
	resolving: " — still resolving names",
	partial: " — some names could not be resolved",
};

/**
 * How a Find answer reads as a count.
 *
 * Two sentences, because they answer two different questions. A capped list
 * names both numbers — twenty on screen, four hundred found — since an Author
 * who is not told the second reads the first as the whole answer and stops
 * typing. A list holding everything it found says only how much that was: an
 * "of" there would invite someone to wonder what was withheld, and nothing was.
 *
 * And in either case the answer's own state decides whether the number may be
 * read as a total. "Showing 20 of 431 matches" over a set that is still
 * arriving misleads exactly as "no matches" does — both claim a whole tree was
 * searched — so the count is the one place the reservation has to reach as well
 * as the empty state (#149, #152).
 */
function describeFindCount({
	results,
	total,
	state,
}: ReferenceFindAnswer): string {
	const counted =
		total > results.length
			? `Showing ${results.length} of ${total} matches`
			: total === 1
				? "1 match"
				: `${total} matches`;
	return `${counted}${RESERVATIONS[state]}`;
}

/**
 * What Find says when it has nothing to list — the sentence this ticket exists
 * for.
 *
 * Three states, three sentences, and the one an Author must never be shown out
 * of turn is the plain one: "No matching References" over a set that is still
 * arriving is a control lying about what the tree contains, which is the one
 * thing matching in the browser buys (ADR-0013).
 *
 * While names are arriving the sentence does not mention matching at all. There
 * is nothing to report yet — an Author told "no matches yet" reads the first two
 * words and stops — and what they need to know is that the answer is coming
 * without them doing anything.
 *
 * It takes the state rather than an answer, because it is the one sentence here
 * that does not depend on the query: nothing matched is nothing matched, and
 * what varies is only how far Find is entitled to say so.
 */
function describeFindNothing(state: ReferenceFindState): string {
	if (state === "resolving") return "Still resolving names…";
	return `No matching References${RESERVATIONS[state]}`;
}

export interface ReferenceFindProps {
	/** Every row of the tree — folded ones included, since a collapsed branch
	 * hiding the answer is the whole problem Find exists for. */
	rows: readonly ReferenceRow[];
	/** Resolved display names, keyed by Content id; absent falls back to the
	 * id, exactly as a row falls back. */
	names: Record<string, string>;
	/**
	 * How far those names can be relied on — decided by `referenceFindState`
	 * from what the Field's own lookup is doing, and passed in rather than
	 * guessed at here.
	 *
	 * A record of names cannot carry it: an id with no name reads the same
	 * whether it has not arrived, has no Adapter to arrive from, or was asked
	 * for and never came. Guessing would mean a control deciding for itself
	 * whether it is entitled to report an absence, which is the decision this
	 * takes away from it.
	 */
	state: ReferenceFindState;
	/** Called with the key of the Reference an Author picked — what a Reveal
	 * names. */
	onReveal: (key: string) => void;
}

/**
 * The Reference-shaped caller of the shared search combobox: it knows what a
 * Find result is — a row in *this* tree, named by the Content it points at and
 * placed by its ancestors — and hands that to a component that does not.
 *
 * Two things it deliberately does not do:
 *
 * - **It claims no keyboard shortcut.** `slashShortcut` is left off. The claim
 *   is first-mounted-wins, and a Reference Field lives inside a form whose own
 *   search has already made it — so opting in would register a listener that
 *   could never fire, which is worse than none at all.
 * - **It never touches the tree.** Picking a result names a Reference; opening
 *   the way down to it, and landing on it, are the tree's own business. Find
 *   changes what is folded and where an Author is looking, and nothing else —
 *   so a drag is never standing on ground that moved.
 */
export function ReferenceFind({
	rows,
	names,
	state,
	onReveal,
}: ReferenceFindProps) {
	// Called during render by the combobox, and pure — the results and the
	// dropdown's open state land in one render, which its Escape containment
	// depends on.
	//
	// One `findReferences` call answers both the list and the count: the twenty
	// rows an Author reads, the "of four hundred" beside them and how far either
	// may be trusted come out of a single walk of a single tree, so no keystroke
	// can leave them describing different answers.
	//
	// It is also what makes a batch landing enough on its own: this runs on
	// every render, so names arriving re-answer the query an Author already
	// typed rather than waiting for them to type it again.
	const search = useCallback(
		(query: string) => {
			const answer = findReferences(rows, names, query, state);
			return { results: answer.results, countLabel: describeFindCount(answer) };
		},
		[rows, names, state],
	);

	return (
		<SearchCombobox<ReferenceFindResult>
			search={search}
			describeResult={(result) => ({
				key: result.key,
				label: result.name,
				// A root sits inside nothing, so it gets no second line rather
				// than an empty one for a reader to announce.
				secondary:
					result.ancestors.length > 0
						? result.ancestors.join(PATH_SEPARATOR)
						: undefined,
			})}
			// Stacked, because an ancestor path is far too long to trail a name
			// at the end of a row — which is the case the layout exists for.
			layout="stacked"
			onSelect={(result) => onReveal(result.key)}
			placeholder="Find a Reference…"
			// The empty sentence and the count are the two halves of one
			// answer, and both are worded from the same `state` — the combobox
			// shows exactly one of them, whichever way the result count fell, so
			// there is never a screen carrying two verdicts about one tree.
			noResultsLabel={describeFindNothing(state)}
			label="Find a Reference"
			testId="reference-find"
		/>
	);
}
ReferenceFind.displayName = "ReferenceFind";
