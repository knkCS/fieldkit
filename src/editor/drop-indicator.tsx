// src/editor/drop-indicator.tsx
import { Box, Flex } from "@chakra-ui/react";

export type DropIndicatorVariant = "above" | "below" | "flow";

/**
 * The mid-drag insertion line (drag-feedback spec 2026-07-14, Decision 3):
 * a 3px accent line with an end-dot at the exact insertion point. It
 * renders in the SAME geometry slots as the ⊕ insertion boundaries (which
 * are display:none during a drag): "above" mirrors the overlay boundary
 * (an absolute strip filling the 20px gap above a shell/frame), "below" is
 * its bottom-edge mirror (a block landing after the last frame), "flow"
 * mirrors the in-flow trailing boundary at the end of a tab or card body.
 *
 * `active=false` renders the empty strip only: during a drag every flow
 * slot must keep the hidden ⊕ boundary's height so the list holds still
 * (Decision 2) — the line itself appears in at most ONE slot.
 *
 * `position` is the slot's identity for tests and the single-source pin:
 * "{tabIndex}:{position}" (boundary dialect) for field targets,
 * "card:{accessor}:before|after" for card block targets.
 */
export function DropIndicatorLine({
	variant,
	active = true,
	position,
}: {
	variant: DropIndicatorVariant;
	active?: boolean;
	position?: string;
}) {
	return (
		<Flex
			data-testid={active ? "drop-indicator" : undefined}
			data-position={active ? position : undefined}
			align="center"
			height="5"
			pointerEvents="none"
			{...(variant === "flow"
				? { position: "relative" as const }
				: {
						position: "absolute" as const,
						left: "0",
						right: "0",
						zIndex: "docked",
						...(variant === "above" ? { top: "-5" } : { bottom: "-5" }),
					})}
		>
			{active && (
				<>
					<Box
						width="2"
						height="2"
						borderRadius="full"
						bg="accent"
						flexShrink="0"
					/>
					<Box flex="1" borderTopWidth="3px" borderColor="accent" />
				</>
			)}
		</Flex>
	);
}
DropIndicatorLine.displayName = "DropIndicatorLine";
