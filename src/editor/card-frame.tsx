// src/editor/card-frame.tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconButton } from "@knkcs/anker/atoms";
import { Tooltip } from "@knkcs/anker/primitives";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { Field } from "../schema/types";
import type { EditorLabels } from "./spec-editor";

/** Already-flat EditorLabels key names (same pattern as FieldShell's
 * toolbar labels) — a host's merged EditorLabels satisfies this
 * structurally with no renaming layer. */
export type CardFrameLabels = Pick<
	Required<EditorLabels>,
	"cardUntitled" | "dragCard"
>;

export interface CardFrameProps {
	card: Field;
	selected: boolean;
	onSelect: (accessor: string) => void;
	/** The ⋯ menu node; the canvas builds it (it owns the delete flows). */
	menu?: ReactNode;
	labels: CardFrameLabels;
	children: ReactNode;
}

/**
 * Build-canvas card frame (Decision 5, header-bar treatment): every card
 * renders a header row — drag handle (moves the WHOLE card block), title
 * (italic `cardUntitled` placeholder when empty), ⋯ menu. Header click
 * selects the card; the body renders the normal field shells unchanged.
 * The frame is a sortable item in the tab's ONE flat list (id = the card
 * marker's accessor): `setNodeRef` on the frame, listeners on the handle —
 * per docs/dnd-kit-reference.md.
 */
export function CardFrame({
	card,
	selected,
	onSelect,
	menu,
	labels,
	children,
}: CardFrameProps) {
	const accessor = card.config.api_accessor;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: accessor,
		// See FieldShell: the DragOverlay's drop animation is the only settle.
		animateLayoutChanges: () => false,
	});
	const title = card.config.name.trim();

	return (
		<Box
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			// Dimmed origin (drag-feedback spec, Decision 1) — see FieldShell.
			opacity={isDragging ? 0.35 : 1}
			data-drag-origin={isDragging ? "true" : undefined}
			bg="bg-surface"
			borderWidth="2px"
			borderStyle={isDragging ? "dashed" : "solid"}
			borderColor={selected ? "accent" : "border"}
			borderRadius="lg"
			boxShadow="sm"
			data-testid={`card-frame-${accessor}`}
		>
			<Flex
				align="center"
				gap="2"
				px="5"
				py="2"
				borderBottomWidth="1px"
				borderColor="border"
				bg="bg-subtle"
				borderTopRadius="lg"
				cursor="pointer"
				role="button"
				tabIndex={0}
				aria-label={title || labels.cardUntitled}
				data-testid={`card-header-${accessor}`}
				onClick={() => onSelect(accessor)}
				onKeyDown={(e) => {
					// Only keys aimed at the header itself; keys from the handle or
					// menu must neither select the card nor be blocked from
					// dnd-kit's document-level keyboard listener.
					if (e.target !== e.currentTarget) return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onSelect(accessor);
					}
				}}
			>
				{/* closeOnEscape=false: an open tooltip's Escape handler would
				    otherwise swallow the Escape that cancels a keyboard drag
				    (same rationale as FieldShell's drag handle). */}
				<Tooltip content={labels.dragCard} closeOnEscape={false}>
					<IconButton
						aria-label={labels.dragCard}
						size="2xs"
						variant="ghost"
						{...attributes}
						{...listeners}
					>
						<GripVertical size={14} />
					</IconButton>
				</Tooltip>
				{title ? (
					<Text fontSize="sm" fontWeight="semibold" flex="1">
						{title}
					</Text>
				) : (
					<Text fontSize="sm" color="fg.muted" fontStyle="italic" flex="1">
						{labels.cardUntitled}
					</Text>
				)}
				{menu && (
					// The menu opens on click — it must not also select the card.
					<Box onClick={(e) => e.stopPropagation()}>{menu}</Box>
				)}
			</Flex>
			{/* p=5 matches the renderer's CardSurface padding — Build canvas and
			    rendered form must present cards with the same rhythm. */}
			<Box p="5">{children}</Box>
		</Box>
	);
}
CardFrame.displayName = "CardFrame";
