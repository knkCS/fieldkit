// src/editor/card-menu.tsx
import { IconButton } from "@knkcs/anker/atoms";
import {
	MenuContent,
	MenuItem,
	MenuRoot,
	MenuTrigger,
} from "@knkcs/anker/primitives";
import { Ellipsis } from "lucide-react";
import type { EditorLabels } from "./spec-editor";

/** Already-flat EditorLabels key names — no renaming layer needed between
 * EditorLabels and this menu's labels prop (same pattern as SectionMenu). */
export type CardMenuLabels = Pick<
	Required<EditorLabels>,
	"renameCard" | "deleteCardMerge" | "deleteCardWithFields"
>;

export interface CardMenuProps {
	cardAccessor: string;
	/** Rename lives in the config panel (a card's one setting) — the canvas
	 * wires this to onEdit, which selects the card AND pulses the panel's
	 * Name-input autofocus. */
	onRename: (accessor: string) => void;
	/** Non-destructive: removes only the marker — fields merge into the
	 * previous card / the next card (first card) / go bare (only card). */
	onDeleteMerge: (accessor: string) => void;
	onDeleteWithFields: (accessor: string) => void; // caller confirms
	labels: CardMenuLabels;
	/** Pre-interpolated aria-label for the trigger, e.g. "Card menu: Basics". */
	triggerAriaLabel: string;
}

export function CardMenu({
	cardAccessor,
	onRename,
	onDeleteMerge,
	onDeleteWithFields,
	labels,
	triggerAriaLabel,
}: CardMenuProps) {
	return (
		<MenuRoot>
			<MenuTrigger asChild>
				<IconButton aria-label={triggerAriaLabel} size="2xs" variant="ghost">
					<Ellipsis size={12} />
				</IconButton>
			</MenuTrigger>
			<MenuContent>
				<MenuItem value="rename" onSelect={() => onRename(cardAccessor)}>
					{labels.renameCard}
				</MenuItem>
				<MenuItem
					value="delete-merge"
					onSelect={() => onDeleteMerge(cardAccessor)}
				>
					{labels.deleteCardMerge}
				</MenuItem>
				<MenuItem
					value="delete-with-fields"
					color="danger.600"
					onSelect={() => onDeleteWithFields(cardAccessor)}
				>
					{labels.deleteCardWithFields}
				</MenuItem>
			</MenuContent>
		</MenuRoot>
	);
}
CardMenu.displayName = "CardMenu";
