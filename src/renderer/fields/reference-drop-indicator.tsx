// src/renderer/fields/reference-drop-indicator.tsx
/**
 * The line a Reference Tree drag draws where releasing would land, at the depth
 * it would land at.
 *
 * **The house pattern it follows is the editor canvas's `DropIndicatorLine`**
 * (`src/editor/drop-indicator.tsx`, drag-feedback spec 2026-07-14 Decision 3):
 * a 3px accent line with an end-dot, in semantic tokens, drawn from the same
 * resolution the release reads. This is a deliberate copy rather than a shared
 * component. The canvas's takes `variant: "above" | "below" | "flow"` —
 * boundary dialect for absolutely-positioned strips between shells and card
 * frames — which describes nothing about a 4px in-flow gap between two tree
 * rows; and `/renderer` imports nothing from `/editor`, so a Consumer taking
 * the Field would otherwise pull the specification editor in behind it. The two
 * move together visually, not by reference (tree drag-feedback spec 2026-08-05,
 * Decision 6).
 *
 * It renders in the insertion strip's own slot geometry — `ReferenceInsertSpacer`
 * is what sits in every *other* gap while a drag runs, and the two share
 * {@link INSERT_SLOT_HEIGHT} so the line can never be a different size from the
 * gap it appears in. Nothing shifts when it appears, and the strip and the
 * indicator cannot disagree about where a gap is.
 *
 * Purely visual, and hidden from the accessibility tree: the depth it draws is
 * on the dragged row as well, and the tree already keeps one live region for a
 * drag (the adoption notice). A second voice announcing the same resolution is
 * how one interaction comes to speak twice.
 */
import { Box, Flex } from "@chakra-ui/react";
import { INSERT_SLOT_HEIGHT } from "./reference-insert-strip";

export interface ReferenceDropIndicatorProps {
	/** Which gap this is, numbered as the insertion strips are: `0` before the
	 * first row on screen, `rows.length` after the last. */
	slot: number;
	/** The depth releasing would land at — `projectDropDepth`'s answer, bounds
	 * already applied, never a depth derived a second time here. */
	depth: number;
	/** Pixels one level of indentation is drawn at, so the line stands where the
	 * Reference will. */
	indentWidth: number;
}

export function ReferenceDropIndicator({
	slot,
	depth,
	indentWidth,
}: ReferenceDropIndicatorProps) {
	return (
		<Flex
			align="center"
			height={INSERT_SLOT_HEIGHT}
			// The dot is taller than the gap and overflows it by a couple of
			// pixels either side, which is what makes a 4px slot readable without
			// the slot growing and shifting the list.
			pointerEvents="none"
			aria-hidden="true"
			// Drawn where the Reference would land, so the level is read off the
			// tree rather than off a label — the same way the insertion strip
			// draws its own line.
			ps={`${String(depth * indentWidth)}px`}
			data-testid="reference-drop-indicator"
			data-slot={slot}
			data-depth={depth}
		>
			<Box
				width="2"
				height="2"
				borderRadius="full"
				bg="accent"
				flexShrink="0"
			/>
			<Box flex="1" borderTopWidth="3px" borderColor="accent" />
		</Flex>
	);
}
ReferenceDropIndicator.displayName = "ReferenceDropIndicator";
