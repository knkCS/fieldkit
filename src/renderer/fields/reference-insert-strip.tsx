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
 *
 * The sentence itself lives in `reference-destination.ts`, because the add
 * drawer says it a second time once the strip is off the screen and the two
 * must be one sentence rather than two phrasings of one fact.
 */
import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { ReferenceRow } from "../../schema/reference-tree";
import { projectInsertDepth } from "../../schema/reference-tree";
import { describeInsert, insertRelation } from "./reference-destination";

/** What the strip says when the Field is already holding `max_items`. */
export const INSERT_AT_CAP_LABEL = "Maximum number of References reached";

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
	/**
	 * Where a click landed — the slot among the rows on screen, the depth the
	 * strip was offering when it happened, and the sentence it was showing.
	 *
	 * The sentence travels rather than being re-derived because the drawer that
	 * opens next says it again, and by then the neighbours it was read off are
	 * no longer the ones on screen. Handing over the string that was actually
	 * announced is what makes the two agree by construction.
	 */
	onInsert: (slot: number, depth: number, destination: string) => void;
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

	// Where a click would land, said once — shown here, and handed on to the
	// drawer that opens next so it says the same thing rather than its own.
	const destination = describeInsert(
		insertRelation(rows, slot, depth),
		adopted.length,
		(row) => names[row.reference.id] ?? row.reference.id,
	);
	const label = disabled ? INSERT_AT_CAP_LABEL : destination;

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
				if (!disabled) onInsert(slot, depth, destination);
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
