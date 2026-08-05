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
import { referenceAncestorRows } from "./reference-tree";

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
 * What a row shows, and therefore what Find matches: the resolved display name,
 * falling back to the id.
 *
 * The fallback is not id matching (that is #151's, and matches an id *as well
 * as* a name). It is Find degrading exactly as the rows already do — with no
 * Adapter, or after a failed lookup, an id is the name on screen, and a control
 * that could not find what is on screen would be lying about the tree.
 */
function displayName(row: ReferenceRow, names: Record<string, string>): string {
	return names[row.reference.id] ?? row.reference.id;
}

/**
 * The References in a tree whose display name contains `query`, in the order
 * the tree holds them.
 *
 * Case-insensitive substring, and nothing else: no ranking, no cap, no
 * diacritic folding. A blank query answers with nothing rather than with
 * everything — Find is asked a question, and "all of them" is what the tree
 * already says.
 *
 * Every row is searched, not the rows a fold set leaves on screen. A collapsed
 * branch hiding the answer is the whole problem Find exists for.
 */
export function findReferences(
	rows: readonly ReferenceRow[],
	names: Record<string, string>,
	query: string,
): ReferenceFindResult[] {
	const needle = query.trim().toLowerCase();
	if (needle === "") return [];
	const found: ReferenceFindResult[] = [];
	rows.forEach((row, index) => {
		const name = displayName(row, names);
		if (!name.toLowerCase().includes(needle)) return;
		found.push({
			key: row.key,
			name,
			// The tree model's own ancestor walk, reversed into reading order —
			// the same rule `foldsToReveal` reads, so the path a result shows can
			// never name a route different from the folds picking it opens.
			ancestors: referenceAncestorRows(rows, index)
				.map((ancestor) => displayName(ancestor, names))
				.reverse(),
		});
	});
	return found;
}
