// src/editor/section-menu.tsx
import { IconButton } from "@knkcs/anker/atoms";
import {
	MenuContent,
	MenuItem,
	MenuRoot,
	MenuTrigger,
} from "@knkcs/anker/primitives";
import { ChevronDown } from "lucide-react";

export interface SectionMenuLabels {
	renameSection: string;
	moveLeft: string;
	moveRight: string;
	deleteSection: string;
	orientationH: string;
	orientationV: string;
}

export interface SectionMenuProps {
	sectionAccessor: string;
	sectionName: string;
	isFirst: boolean; // orientation item only on the first section
	orientation: "horizontal" | "vertical";
	onRename: (accessor: string, name: string) => void;
	onMove: (accessor: string, direction: -1 | 1) => void;
	onDelete: (accessor: string) => void; // caller confirms
	onOrientation: (o: "horizontal" | "vertical") => void;
	labels: SectionMenuLabels;
	/** Pre-interpolated aria-label for the trigger, e.g. "Section menu: SEO". */
	triggerAriaLabel: string;
}

export function SectionMenu({
	sectionAccessor,
	sectionName,
	isFirst,
	orientation,
	onRename,
	onMove,
	onDelete,
	onOrientation,
	labels,
	triggerAriaLabel,
}: SectionMenuProps) {
	return (
		<MenuRoot>
			<MenuTrigger asChild>
				<IconButton aria-label={triggerAriaLabel} size="2xs" variant="ghost">
					<ChevronDown size={12} />
				</IconButton>
			</MenuTrigger>
			<MenuContent>
				<MenuItem
					value="rename"
					onSelect={() => onRename(sectionAccessor, sectionName)}
				>
					{labels.renameSection}
				</MenuItem>
				<MenuItem
					value="move-left"
					onSelect={() => onMove(sectionAccessor, -1)}
				>
					{labels.moveLeft}
				</MenuItem>
				<MenuItem
					value="move-right"
					onSelect={() => onMove(sectionAccessor, 1)}
				>
					{labels.moveRight}
				</MenuItem>
				{isFirst && (
					<MenuItem
						value="orientation"
						onSelect={() =>
							onOrientation(
								orientation === "vertical" ? "horizontal" : "vertical",
							)
						}
					>
						{orientation === "vertical"
							? labels.orientationH
							: labels.orientationV}
					</MenuItem>
				)}
				<MenuItem
					value="delete"
					color="danger.600"
					onSelect={() => onDelete(sectionAccessor)}
				>
					{labels.deleteSection}
				</MenuItem>
			</MenuContent>
		</MenuRoot>
	);
}
SectionMenu.displayName = "SectionMenu";
