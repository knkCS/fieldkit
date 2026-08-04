// src/renderer/fields/reference-insert-strip.tsx
/**
 * The insertion strip: the thin gap between two Reference rows that an Author
 * can point at to add a Reference *there* rather than at the end of the tree.
 *
 * It is the affordance and nothing else. Where a click would land, how deep it
 * may go, and what it would take with it are all `projectInsertDepth`'s answers
 * (`src/schema/reference-tree.ts`) — this file reads them and says them out
 * loud. Nothing here re-derives a bound, and nothing here writes a value.
 *
 * Saying them out loud is the point rather than a courtesy. A Reference
 * arriving shallower than the rows below it takes them as children (ADR-0012),
 * which restructures rows the Author never pointed at; announcing that before
 * the click is what separates the behaviour from the defect knkCMS core's
 * silent version is (`docs/core-reference-tree-comparison.md` §5.1). The
 * second half of that record is the naming: core's label names the prospective
 * *parent* in both its branches, so a strip that re-parents a whole branch
 * reads "+ Add sibling of A" (§5.7). {@link insertRelation} names what it
 * actually names.
 */
import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { ReferenceRow } from "../../schema/reference-tree";
import { projectInsertDepth } from "../../schema/reference-tree";

/** What a Reference arriving at a slot would be, and to whom. */
export type InsertRelation =
	| { kind: "child"; row: ReferenceRow }
	| { kind: "sibling"; row: ReferenceRow }
	| { kind: "root" };

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

/** What the strip says when the Field is already holding `max_items`. */
export const INSERT_AT_CAP_LABEL = "Maximum number of References reached";

/**
 * The sentence a strip shows, and its accessible name — one string, so what is
 * read out and what is on screen can never drift apart.
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
	nameOf: (row: ReferenceRow) => string,
): string {
	const opening =
		relation.kind === "root"
			? "Insert as a root Reference"
			: `Insert as a ${relation.kind} of ${nameOf(relation.row)}`;
	if (adopted === 0) return opening;
	const plural = adopted === 1 ? "Reference" : "References";
	return `${opening}, adopting ${String(adopted)} ${plural}`;
}

export interface ReferenceInsertStripProps {
	/**
	 * The rows on screen, top to bottom — the list the projection reads, since
	 * a slot an Author cannot see is not one they pointed at.
	 */
	rows: readonly ReferenceRow[];
	/** Where among them this strip sits: `0` before the first row, `rows.length`
	 * after the last. */
	slot: number;
	/** Resolved display names by Content id; absent falls back to the id, as a
	 * row's own name does. */
	names: Record<string, string>;
	/** Pixels one level of indentation is drawn at — how the pointer's distance
	 * from the tree's left edge reads as a depth. */
	indentWidth: number;
	/** The deepest depth a Reference may sit at, roots being 0. */
	depthCeiling?: number;
	/** At `max_items`: offered but inert, so the limit is visible rather than
	 * the affordance silently missing. */
	disabled?: boolean;
	/** Where a click landed — the slot among the rows on screen, and the depth
	 * the strip was offering when it happened. */
	onInsert: (slot: number, depth: number) => void;
}

/**
 * One insertion strip: a hairline that grows under the pointer and shows,
 * at the depth it would land, what clicking it would do.
 *
 * It is a real `button`, not a div with a click handler, which is what puts it
 * in the tab order and in the accessibility tree with its sentence as its name.
 * Choosing the *depth* from the keyboard is a separate ticket (#100); this
 * leaves the seam for it — the projection already takes an offset, and a key
 * handler only has to move one.
 */
export function ReferenceInsertStrip({
	rows,
	slot,
	names,
	indentWidth,
	depthCeiling,
	disabled = false,
	onInsert,
}: ReferenceInsertStripProps) {
	// How far into the row the pointer sits, or null while nobody is pointing
	// at this strip: a strip nobody is on announces nothing, and the two facts
	// are the same fact.
	const [offsetX, setOffsetX] = useState<number | null>(null);
	const pointed = offsetX !== null && !disabled;

	const { depth, adopted } = projectInsertDepth({
		items: rows,
		slot,
		offsetX: offsetX ?? 0,
		indentWidth,
		depthCeiling,
	});

	const label = disabled
		? INSERT_AT_CAP_LABEL
		: describeInsert(
				insertRelation(rows, slot, depth),
				adopted.length,
				(row) => names[row.reference.id] ?? row.reference.id,
			);

	return (
		<chakra.button
			type="button"
			aria-label={label}
			disabled={disabled}
			data-testid="reference-insert-strip"
			data-slot={slot}
			data-depth={depth}
			data-adopted={adopted.length}
			display="block"
			width="full"
			textAlign="start"
			// A 4px hairline in the gap the rows' own margin already leaves, and
			// 32px under the pointer: enough to read the sentence in, and small
			// enough that the rows stay a list.
			height={pointed ? "8" : "1"}
			transition="height 0.12s"
			cursor={disabled ? "not-allowed" : "pointer"}
			onMouseMove={(event) => {
				if (disabled) return;
				// Measured from the strip's own left edge, which is the tree's:
				// a strip is never indented, whatever depth it is offering.
				const { left } = event.currentTarget.getBoundingClientRect();
				setOffsetX(event.clientX - left);
			}}
			onMouseLeave={() => setOffsetX(null)}
			// Keyboard parity with the hover: focus reveals the same sentence
			// rather than landing on an invisible control (WCAG 2.4.7).
			onFocus={() => setOffsetX(0)}
			onBlur={() => setOffsetX(null)}
			onClick={() => {
				if (!disabled) onInsert(slot, depth);
			}}
		>
			{pointed && (
				<Flex
					align="center"
					gap="2"
					height="full"
					// Drawn where the Reference would land, so the depth is read
					// off the tree rather than off the sentence.
					ps={`${String(depth * indentWidth)}px`}
					data-testid="reference-insert-line"
					data-depth={depth}
				>
					<Box
						width="2"
						height="2"
						borderRadius="full"
						bg="accent"
						flexShrink="0"
					/>
					<Text
						fontSize="xs"
						color="fg.muted"
						whiteSpace="nowrap"
						data-testid="reference-insert-label"
					>
						{label}
					</Text>
					<Box flex="1" borderTopWidth="2px" borderColor="accent" />
				</Flex>
			)}
		</chakra.button>
	);
}
ReferenceInsertStrip.displayName = "ReferenceInsertStrip";

/**
 * What sits in a strip's place while a drag is running: the same height, and
 * nothing else.
 *
 * Two insertion affordances must never compete for one gap (ADR-0012 gives the
 * strip and the drop the same vocabulary precisely so they agree), and a
 * hover-revealable strip over a transforming row would intercept the pointer
 * as well — the editor canvas hides its own insertion boundaries mid-drag for
 * exactly that reason. Keeping the height is what stops the list jumping the
 * moment a row is lifted.
 */
export function ReferenceInsertSpacer() {
	// The collapsed strip's height exactly, so nothing shifts the moment a row
	// is lifted.
	return (
		<Box height="1" aria-hidden="true" data-testid="reference-insert-spacer" />
	);
}
ReferenceInsertSpacer.displayName = "ReferenceInsertSpacer";
