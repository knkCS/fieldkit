// src/renderer/fields/reference-fold-all.tsx
import { IconButton } from "@chakra-ui/react";
import { Tooltip } from "@knkcs/anker/primitives";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { FieldLabelActions } from "../field-label-row";

export interface ReferenceFoldAllProps {
	/** Opens every branch. */
	onExpand: () => void;
	/** Folds every branch, leaving the top level on screen. */
	onCollapse: () => void;
	/**
	 * Drawn before the two buttons in the same row — the tree's search
	 * (contenthub #642). One `FieldLabelActions` for all three rather than a
	 * second beside it, because two portals into one slot draw in whichever
	 * order they happened to mount, and the search belongs first.
	 */
	leading?: ReactNode;
}

/**
 * Expand all and Collapse all: a Reference Tree opened whole, or folded to its
 * top level, in one act — drawn in the Field's label row.
 *
 * A tree sprawls open as it is worked, and by design — a Reveal is not a
 * preview, so nothing silently folds one back, and a fold an Author opened by
 * hand is never fought either (CONTEXT.md). Collapse all is the one deliberate
 * way back; Expand all is the other direction, the whole structure at once.
 *
 * On every non-empty tree, at any size (contenthub #637): controls that came
 * and went with a tree's size were never where an Author last saw them, and a
 * fifteen-row tree three levels deep wants both as much as one of thousands.
 *
 * One component for both renderers rather than buttons in each, because what
 * matters about it is the names: a control an Author meets while editing and
 * again while reading has to be the same control, said the same way, in the
 * same place. Everything it *does* is the tree's own — each renderer hands it
 * the changes that belong to its own fold set.
 *
 * Icon buttons, so a three-item tree's label row stays calm; each carries its
 * name as `aria-label` and again as a tooltip, so it says what it does to a
 * screen reader and to a pointer alike.
 */
export function ReferenceFoldAll({
	onExpand,
	onCollapse,
	leading,
}: ReferenceFoldAllProps) {
	return (
		<FieldLabelActions>
			{leading}
			<Tooltip content="Expand all">
				<IconButton
					aria-label="Expand all"
					size="xs"
					variant="ghost"
					onClick={onExpand}
				>
					<ChevronsUpDown size={14} />
				</IconButton>
			</Tooltip>
			<Tooltip content="Collapse all">
				<IconButton
					aria-label="Collapse all"
					size="xs"
					variant="ghost"
					onClick={onCollapse}
				>
					<ChevronsDownUp size={14} />
				</IconButton>
			</Tooltip>
		</FieldLabelActions>
	);
}
ReferenceFoldAll.displayName = "ReferenceFoldAll";
