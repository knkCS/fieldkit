// src/renderer/fields/reference-destination.ts
/**
 * Where a Reference about to be added will land, said in one sentence.
 *
 * The sentence exists because inserting a Reference restructures rows the
 * Author never pointed at: one arriving shallower than the rows below takes
 * them as children (ADR-0012). That record calls the announcement "part of the
 * decision, not decoration" — without it the behaviour is indistinguishable
 * from the silent version knkCMS core has, which is the defect it was modelled
 * on (`docs/core-reference-tree-comparison.md` §5.1).
 *
 * It is said **twice**, at two moments: on the insertion strip before the
 * click, and in the add drawer's header while a Content is being chosen — the
 * strip's label is off the screen by then, and the drawer is where the write is
 * actually committed. This module is why those two are one sentence and not
 * two: a second phrasing of one fact is exactly the drift the announcement was
 * meant to prevent, and it would be free to disagree with the first.
 *
 * Nothing here derives a depth or a bound. `projectInsertDepth`
 * (`src/schema/reference-tree.ts`) answers where a placement lands and which
 * rows it would take; this only reads that answer out loud.
 */
import type { ReferenceRow } from "../../schema/reference-tree";

/** What a Reference arriving at a slot would be, and to whom. */
export type InsertRelation =
	| { kind: "child"; row: ReferenceRow }
	| { kind: "sibling"; row: ReferenceRow }
	| { kind: "root" };

/** How a row's name is looked up — absent falls back to the id, as a row's own
 * name on the tree does. */
export type ReferenceRowName = (row: ReferenceRow) => string;

/**
 * The Reference a new one landing at `depth` in `slot` would sit under or
 * beside — and which of the two it would be.
 *
 * Three readings, in the order they settle:
 *
 * - One level deeper than the row above makes it that row's **first child**;
 *   there is no sibling to name, so the parent is what the label names.
 * - Otherwise it joins a rank that already exists, and the Reference it sits
 *   beside is the nearest row **above** at its own depth. Searching upwards
 *   stops at the first row shallower than the arrival: that is the parent it
 *   would hang under, and nothing above it is a sibling.
 * - Before the first row of a rank there is nothing above to name, so the
 *   sibling it would **precede** is named instead — which is what makes the
 *   strip at the very top of the tree say something true.
 *
 * `rows` are the rows on screen. A depth is only offered against neighbours an
 * Author can see, so the Reference the label names is one of them.
 */
export function insertRelation(
	rows: readonly ReferenceRow[],
	slot: number,
	depth: number,
): InsertRelation {
	const above = rows[slot - 1];
	if (above && depth === above.depth + 1) return { kind: "child", row: above };
	for (let index = slot - 1; index >= 0; index--) {
		if (rows[index].depth === depth)
			return { kind: "sibling", row: rows[index] };
		if (rows[index].depth < depth) break;
	}
	for (let index = slot; index < rows.length; index++) {
		if (rows[index].depth === depth)
			return { kind: "sibling", row: rows[index] };
		if (rows[index].depth < depth) break;
	}
	return { kind: "root" };
}

/**
 * The sentence a strip shows — which is also its accessible name, so what is
 * read out and what is on screen can never drift apart — and the sentence the
 * add drawer repeats.
 *
 * The adoption clause is appended only when rows would actually move, because a
 * clause that is always there stops being read. It counts the rows the
 * projection reported, which are the rows **on screen**: a folded Reference
 * stands in for its whole branch everywhere else in this control, and counting
 * the branch it hides would name a number an Author cannot see.
 */
export function describeInsert(
	relation: InsertRelation,
	adopted: number,
	nameOf: ReferenceRowName,
): string {
	const opening =
		relation.kind === "root"
			? "Insert as a root Reference"
			: `Insert as a ${relation.kind} of ${nameOf(relation.row)}`;
	if (adopted === 0) return opening;
	const plural = adopted === 1 ? "Reference" : "References";
	return `${opening}, adopting ${String(adopted)} ${plural}`;
}

/**
 * Where the Field's own Add control puts a Reference: after everything, at the
 * root.
 *
 * Expressed through the same builder rather than written out, so the one
 * entry point that never goes through a strip still reads in the tree's
 * vocabulary instead of saying nothing or saying it differently. Two facts make
 * it a plain call:
 *
 * - **It adopts nothing.** An append sits after every row, so no row follows it
 *   to be taken.
 * - **`rows` may be every row rather than only the ones on screen.** At depth 0
 *   the only Reference this can name is a root, and a root is never inside a
 *   folded branch — so folding cannot change the answer.
 *
 * An empty tree has no root to sit beside, and reads as one arriving.
 */
export function describeAppend(
	rows: readonly ReferenceRow[],
	nameOf: ReferenceRowName,
): string {
	return describeInsert(insertRelation(rows, rows.length, 0), 0, nameOf);
}
