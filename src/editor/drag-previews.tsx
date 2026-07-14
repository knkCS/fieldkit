// src/editor/drag-previews.tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { formatCount } from "../renderer/merge-labels";
import type { Field, Schema } from "../schema/types";

/** Fields inside a card marker's block (up to the next card/section
 * marker) — the "+ N fields" count on the block-drag preview. */
export function cardBlockFieldCount(draft: Schema, card: Field): number {
	const start = draft.indexOf(card);
	if (start === -1) return 0;
	let count = 0;
	for (let i = start + 1; i < draft.length; i++) {
		const type = draft[i].field_type;
		if (type === "card" || type === "section") break;
		count++;
	}
	return count;
}

/**
 * DragOverlay clone for a FIELD drag (drag-feedback spec 2026-07-14,
 * Decision 1): dnd-kit sizes the overlay wrapper to the active shell's
 * rect; this fills it with the shell's look — shadow + slight tilt for
 * lift. Presentational only; the interior is inert (the same
 * React-18-safe string-value idiom as FieldShell's F8 block).
 */
export function ShellDragPreview({ children }: { children: ReactNode }) {
	return (
		<Box
			data-testid="drag-overlay-preview"
			width="100%"
			height="100%"
			bg="bg-surface"
			borderWidth="2px"
			borderColor="border"
			borderRadius="md"
			boxShadow="lg"
			transform="rotate(1deg)"
			overflow="hidden"
			position="relative"
			py="2"
			pr="2"
			pl="10"
			cursor="grabbing"
		>
			<Box position="absolute" top="2" left="1.5" color="fg.muted" aria-hidden>
				<GripVertical size={14} />
			</Box>
			<Box
				{...({ inert: "true" } as Record<string, unknown>)}
				pointerEvents="none"
				userSelect="none"
			>
				{children}
			</Box>
		</Box>
	);
}
ShellDragPreview.displayName = "ShellDragPreview";

export interface CardDragPreviewLabels {
	cardUntitled: string;
	/** "+ {count} fields" — optional CanvasLabels passthrough with an
	 * English fallback (the tabErrors idiom). */
	cardDragFields?: string;
	/** "+ 1 field" at count 1. */
	cardDragFieldsOne?: string;
}

/**
 * DragOverlay clone for a CARD block drag: the HEADER BAR ONLY plus a
 * "+ N fields" count hint — a full-height frame clone would occlude the
 * canvas (drag-feedback spec, Decision 1). The canvas passes
 * `style={{ height: "auto" }}` to DragOverlay for card drags so the
 * wrapper collapses to this bar instead of the frame's measured height.
 */
export function CardDragPreview({
	card,
	fieldCount,
	labels,
}: {
	card: Field;
	fieldCount: number;
	labels: CardDragPreviewLabels;
}) {
	const title = card.config.name.trim();
	return (
		<Flex
			data-testid="drag-overlay-preview"
			align="center"
			gap="2"
			px="5"
			py="2"
			width="100%"
			bg="bg-subtle"
			borderWidth="2px"
			borderColor="border"
			borderRadius="lg"
			boxShadow="lg"
			transform="rotate(1deg)"
			cursor="grabbing"
		>
			<Box color="fg.muted" aria-hidden>
				<GripVertical size={14} />
			</Box>
			{title ? (
				<Text fontSize="sm" fontWeight="semibold">
					{title}
				</Text>
			) : (
				<Text fontSize="sm" color="fg.muted" fontStyle="italic">
					{labels.cardUntitled}
				</Text>
			)}
			<Text fontSize="xs" color="fg.muted" marginLeft="auto">
				{formatCount(
					labels.cardDragFieldsOne ?? "+ 1 field",
					labels.cardDragFields ?? "+ {count} fields",
					fieldCount,
				)}
			</Text>
		</Flex>
	);
}
CardDragPreview.displayName = "CardDragPreview";
