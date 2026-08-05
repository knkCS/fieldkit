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
import { useEffect, useRef, useState } from "react";
import type { ReferenceRow } from "../../schema/reference-tree";
import { projectInsertDepth } from "../../schema/reference-tree";
import { describeInsert, insertRelation } from "./reference-destination";

/** What the strip says when the Field is already holding `max_items`. */
export const INSERT_AT_CAP_LABEL = "Maximum number of References reached";

/**
 * The height of the gap between two rows — a collapsed strip's, the spacer that
 * stands in for it during a drag, and the drop indicator that replaces the
 * spacer at the landing slot.
 *
 * One value across all three because they are one geometry in three states: the
 * list must not shift when a drag starts, nor when the landing moves from one
 * gap to another. `ReferenceDropIndicator` reads it from here rather than
 * restating it.
 */
export const INSERT_SLOT_HEIGHT = "1";

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
	/** Where the Reference would land — the projection's answer, bounds already
	 * applied. */
	depth: number;
	/** How many rows on screen the arrival would take as its children. */
	adopted: number;
	/**
	 * The sentence describing this landing, whatever the strip is currently
	 * showing — so the click can hand on what was announced even when the
	 * visible label is the cap notice instead.
	 */
	destination: string;
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
	onAnnounce: (message: string | null) => void;
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
	// How far in the offer sits, or null while there is none: a strip nobody is
	// on announces nothing, and the two facts are the same fact. One state for
	// both inputs, so neither can reach a depth the other cannot.
	const [offsetX, setOffsetX] = useState<number | null>(null);
	// Whether the keyboard is on this strip, tracked apart from the offer
	// because the two inputs arrive and leave independently: a pointer crossing
	// a focused strip on its way elsewhere must not take the offer away from
	// the keyboard still standing on it.
	const [focused, setFocused] = useState(false);
	const offering = offsetX !== null && !disabled;
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
	 * edits, on the very press that backed out of a strip. The shared
	 * `SearchCombobox` contains its own Escape this way and for this reason;
	 * window-capture is the one place that runs first, outermost-first and
	 * whatever the registration order.
	 *
	 * Scoped to this strip's own node, so an Escape aimed anywhere else travels
	 * untouched — an unscoped intercept would swallow the one that cancels a
	 * keyboard drag, which is the bug class the same scoping in `SearchCombobox`
	 * exists to avoid.
	 *
	 * Blurring is the whole of the work: `onBlur` already collapses the offer and
	 * hushes the live region, and leaving nothing else here is what stops Escape
	 * from having two answers that could drift apart.
	 *
	 * **A passive effect here, deliberately** — where `SearchCombobox`'s twin is a
	 * layout effect (#82), and the difference is the gate, not the pattern. That
	 * one is opened by anker's *debounced* `onSearch`, i.e. from a timer, and
	 * React defers a timer-lane render's passive effects to a later task: the
	 * dropdown is painted before the listener exists. `focused` is only ever set
	 * from `onFocus` — a discrete event, whose render React commits and whose
	 * passive effects React flushes in the same microtask — so there is no task
	 * between the strip taking focus and this listener being attached, and no
	 * test can tell a layout effect here from this one. Measured, not assumed:
	 * with a spy on `addEventListener`, the attach lands before the first
	 * microtask checkpoint after `focus()` returns. Move the gate onto anything
	 * a timer can set and that stops being true.
	 */
	useEffect(() => {
		// Gated on focus, not on the offer: an Escape belongs to whoever the
		// keyboard is on, and a strip that lost its listener because a pointer
		// went past would leave the press to close the drawer instead.
		if (!focused) return;
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
	}, [focused]);

	/**
	 * What this strip would do with the pointer that far in. Pure, so the
	 * keyboard can ask it about an offset nothing has moved to yet.
	 *
	 * The sentence is built here alongside the projection rather than beside the
	 * render, because both inputs need it: the pointer shows it, an arrow press
	 * speaks it, and the click hands it to the drawer that says it again.
	 */
	function offerAt(x: number): InsertOffer {
		const { depth, adopted } = projectInsertDepth({
			items: rows,
			slot,
			offsetX: x,
			indentWidth,
			depthCeiling,
		});
		const destination = describeInsert(
			insertRelation(rows, slot, depth),
			adopted.length,
			(row) => names[row.reference.id] ?? row.reference.id,
		);
		return {
			depth,
			adopted: adopted.length,
			destination,
			label: disabled ? INSERT_AT_CAP_LABEL : destination,
		};
	}

	const offer = offerAt(offsetX ?? 0);
	const { depth, label, destination } = offer;

	/**
	 * One arrow press, one level — the same level a pointer reaches by travelling
	 * `indentWidth` sideways, written back as the offset that names it so the two
	 * inputs leave the strip in one state.
	 *
	 * It steps from the level **on offer**, which `projectInsertDepth` has
	 * already clamped, rather than from the raw ask — which is what keeps a bound
	 * from banking presses. Three → against a ceiling of one leaves the offer at
	 * one each time, so a single ← still moves; nudging the offset instead would
	 * have piled up three levels of travel to spend before anything on screen
	 * answered. Nothing here re-derives the bound itself.
	 */
	function stepDepth(step: number) {
		const moved = (offer.depth + step) * indentWidth;
		setOffsetX(moved);
		onAnnounce(offerAt(moved).label);
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
			height={offering ? "8" : INSERT_SLOT_HEIGHT}
			transition="height 0.12s"
			cursor={disabled ? "not-allowed" : "pointer"}
			onMouseMove={(event) => {
				if (disabled) return;
				// Measured from the strip's own left edge, which is the tree's:
				// a strip is never indented, whatever depth it is offering.
				const { left } = event.currentTarget.getBoundingClientRect();
				setOffsetX(event.clientX - left);
			}}
			// Only when the keyboard is not standing on it: the pointer taking
			// its own offer away is a mouse leaving, and taking the keyboard's
			// away as well is a focused control going quiet.
			onMouseLeave={() => {
				if (!focused) setOffsetX(null);
			}}
			// Keyboard parity with the hover: focus reveals the same sentence
			// rather than landing on an invisible control (WCAG 2.4.7).
			//
			// It *reveals* an offer, never replaces one. A press focuses a button
			// on mousedown, before the click lands, so overwriting here would have
			// every pointer click insert at the shallowest level the neighbours
			// allow rather than the one being pointed at.
			onFocus={() => {
				setFocused(true);
				setOffsetX((current) => current ?? 0);
			}}
			onBlur={() => {
				setFocused(false);
				setOffsetX(null);
				onAnnounce(null);
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
				if (!disabled) onInsert(slot, depth, destination);
			}}
		>
			{offering && (
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
 *
 * One gap in a drag is not this: the one the release would land in draws
 * `ReferenceDropIndicator` instead, at the same height, so the line appears
 * without anything shifting to make room for it.
 */
export function ReferenceInsertSpacer() {
	// The collapsed strip's height exactly, so nothing shifts the moment a row
	// is lifted.
	return (
		<Box
			height={INSERT_SLOT_HEIGHT}
			aria-hidden="true"
			data-testid="reference-insert-spacer"
		/>
	);
}
ReferenceInsertSpacer.displayName = "ReferenceInsertSpacer";
