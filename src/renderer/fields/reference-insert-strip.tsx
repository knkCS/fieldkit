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
import { useEffect, useRef, useState } from "react";
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

/**
 * What a strip is offering: where a Reference would land, the bounds that
 * decided it, and the one sentence that says so.
 *
 * The projection and the sentence travel together because they are one answer
 * read at one offset — and because the keyboard has to ask for that answer a
 * second time, at the offset an arrow key moves to, without re-deriving either
 * half of it.
 */
interface InsertOffer {
	depth: number;
	minDepth: number;
	maxDepth: number;
	/** How many rows on screen the arrival would take as its children. */
	adopted: number;
	label: string;
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
	/**
	 * The sentence to say out loud when an arrow key moves the depth, and `null`
	 * when the strip is left. The tree owns the live region it goes to, because
	 * one control wants one voice and there are as many strips as there are gaps.
	 *
	 * Arriving is deliberately silent: the strip's accessible name is this same
	 * sentence, so a screen reader already reads it on focus, and repeating it
	 * into a live region is how one interaction comes to speak twice. What a name
	 * does *not* reliably announce is a name that changes under standing focus,
	 * which is exactly what an arrow press does.
	 */
	onAnnounce?: (message: string | null) => void;
}

/**
 * One insertion strip: a hairline that grows under the pointer — or under the
 * focus ring — and shows, at the depth it would land, what pressing it would do.
 *
 * It is a real `button`, not a div with a click handler, which is what puts it
 * in the tab order and in the accessibility tree with its sentence as its name.
 * knkCMS core's strip is the plain div, and cannot be operated without a pointer
 * at all (`docs/core-reference-tree-comparison.md` §5, INS-2).
 *
 * **The pointer and the keyboard are one input, not two.** Both write the same
 * `offsetX`, and every depth on offer is `projectInsertDepth`'s answer over it:
 * where the pointer reads horizontal travel, an arrow key names the level
 * outright and the offset is rewritten to it. So a mouse move after an arrow
 * press is an ordinary mouse move, an arrow press after a mouse move steps from
 * where the pointer left off, and neither input can reach a depth the other
 * cannot. That is the same idea the tree's drag already runs on, where
 * `treeKeyboardCoordinates` maps ←/→ to one indent of the very travel a pointer
 * would have to make (`reference-tree.tsx`).
 */
export function ReferenceInsertStrip({
	rows,
	slot,
	names,
	indentWidth,
	depthCeiling,
	disabled = false,
	onInsert,
	onAnnounce,
}: ReferenceInsertStripProps) {
	// How far into the row the pointer sits, or null while nobody is on this
	// strip: a strip nobody is on announces nothing, and the two facts are the
	// same fact.
	const [offsetX, setOffsetX] = useState<number | null>(null);
	const pointed = offsetX !== null && !disabled;
	const nodeRef = useRef<HTMLButtonElement>(null);

	/**
	 * Escape leaves the strip — and stops there.
	 *
	 * Answered from a **window-level capture** listener rather than the button's
	 * own `onKeyDown`, because by the time a bubble-phase handler runs the press
	 * has already been read by everything above: Ark/zag dismissable layers,
	 * anker's `DrawerRoot` among them, listen for Escape on `document` in the
	 * capture phase. A Reference Field inside a drawer — `EditDrawer` renders one
	 * through `SpecForm` — would otherwise have the drawer close, discarding the
	 * edits, on the very press that backed out of a strip. `FieldSearch` contains
	 * its own Escape this way and for this reason; window-capture is the one
	 * place that runs first, outermost-first and whatever the registration order.
	 *
	 * Scoped to this strip's own node, so an Escape aimed anywhere else travels
	 * untouched — an unscoped intercept would swallow the one that cancels a
	 * keyboard drag, which is the bug class the same scoping in `FieldSearch`
	 * exists to avoid.
	 *
	 * Blurring is the whole of the work: `onBlur` already collapses the offer and
	 * hushes the live region, and leaving nothing else here is what stops Escape
	 * from having two answers that could drift apart.
	 */
	useEffect(() => {
		if (!pointed) return;
		const leaveOnEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (!(event.target instanceof Node)) return;
			const node = nodeRef.current;
			if (!node?.contains(event.target)) return;
			event.stopPropagation();
			node.blur();
		};
		window.addEventListener("keydown", leaveOnEscape, true);
		return () => window.removeEventListener("keydown", leaveOnEscape, true);
	}, [pointed]);

	/**
	 * What this strip would do with the pointer that far in. Pure, so the
	 * keyboard can ask it about an offset nothing has moved to yet.
	 */
	function offerAt(x: number): InsertOffer {
		const { depth, minDepth, maxDepth, adopted } = projectInsertDepth({
			items: rows,
			slot,
			offsetX: x,
			indentWidth,
			depthCeiling,
		});
		return {
			depth,
			minDepth,
			maxDepth,
			adopted: adopted.length,
			label: disabled
				? INSERT_AT_CAP_LABEL
				: describeInsert(
						insertRelation(rows, slot, depth),
						adopted.length,
						(row) => names[row.reference.id] ?? row.reference.id,
					),
		};
	}

	const offer = offerAt(offsetX ?? 0);
	const { depth, label } = offer;

	/**
	 * One arrow press, one level — the same level a pointer reaches by travelling
	 * `indentWidth` sideways, and inside the same bounds, because the step is
	 * taken against the projection's own floor and ceiling.
	 *
	 * Stepping the *level* rather than the offset is what keeps a bound from
	 * banking presses: nudging the offset by a fixed distance would let three →
	 * against a ceiling of one need three ← before anything on screen moved,
	 * which is a control that has stopped answering. The offset is then rewritten
	 * to the level chosen, so the two inputs leave the strip in one state.
	 */
	function stepDepth(step: number) {
		const next = Math.min(
			Math.max(offer.depth + step, offer.minDepth),
			offer.maxDepth,
		);
		const moved = next * indentWidth;
		setOffsetX(moved);
		onAnnounce?.(offerAt(moved).label);
	}

	return (
		<chakra.button
			ref={nodeRef}
			type="button"
			aria-label={label}
			disabled={disabled}
			data-testid="reference-insert-strip"
			data-slot={slot}
			data-depth={depth}
			data-adopted={offer.adopted}
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
			onBlur={() => {
				setOffsetX(null);
				onAnnounce?.(null);
			}}
			// ←/→ only. Escape is answered a phase earlier, above — it never
			// reaches here.
			onKeyDown={(event) => {
				if (disabled) return;
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
				// Claimed, or the page scrolls sideways under a control whose whole
				// purpose is sideways.
				event.preventDefault();
				stepDepth(event.key === "ArrowRight" ? 1 : -1);
			}}
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
