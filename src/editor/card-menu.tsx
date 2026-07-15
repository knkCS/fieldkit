// src/editor/card-menu.tsx
import { Text } from "@chakra-ui/react";
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
	"renameCard" | "deleteCardMerge" | "deleteCardWithFields" | "moveToSection"
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
	/** Other sections this card's block can move to (spring-loaded sections
	 * spec, Decision 5) — omitted/empty on single-tab specs. */
	moveTargets?: Array<{ tabIndex: number; name: string }>;
	onMoveToSection?: (accessor: string, tabIndex: number) => void;
}

export function CardMenu({
	cardAccessor,
	onRename,
	onDeleteMerge,
	onDeleteWithFields,
	labels,
	triggerAriaLabel,
	moveTargets,
	onMoveToSection,
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
				{moveTargets && moveTargets.length > 0 && onMoveToSection && (
					<>
						<Text px="2" pt="1" fontSize="xs" color="fg.muted">
							{labels.moveToSection}
						</Text>
						{moveTargets.map((t) => (
							<MenuItem
								key={t.tabIndex}
								value={`move-${t.tabIndex}`}
								onSelect={() => onMoveToSection(cardAccessor, t.tabIndex)}
							>
								{t.name}
							</MenuItem>
						))}
					</>
				)}
			</MenuContent>
		</MenuRoot>
	);
}
CardMenu.displayName = "CardMenu";
