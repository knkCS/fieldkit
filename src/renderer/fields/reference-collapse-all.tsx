// src/renderer/fields/reference-collapse-all.tsx
import { Button } from "@chakra-ui/react";
import { ChevronsDownUp } from "lucide-react";

export interface ReferenceCollapseAllProps {
	/** Puts the tree back in the fold set it opened in — see
	 * `initialReferenceFolds`, which is what a caller here calls. */
	onCollapse: () => void;
}

/**
 * The way back: one act that returns a Reference Tree to the state it opened
 * in.
 *
 * A tree sprawls open as it is worked, and by design — a Reveal is not a
 * preview, so nothing silently folds one back, and a fold an Author opened by
 * hand is never fought either (CONTEXT.md). On a tree of thousands that leaves
 * no way back short of a chevron per branch, which is why this exists and why
 * it is an **explicit act** rather than something a control guesses at.
 *
 * One component for both renderers rather than a button in each, because what
 * matters about it is the name: a control an Author meets while editing and
 * again while reading has to be the same control, said the same way, in the
 * same place. Everything it *does* is the tree's own — this knows nothing about
 * folds, and each renderer hands it the reset that belongs to its own fold set.
 *
 * An ordinary button, so it is in the tab order and carries its accessible name
 * as its text: the label is the whole of what it announces, and an icon-only
 * version would be a second thing to keep in step with it.
 */
export function ReferenceCollapseAll({
	onCollapse,
}: ReferenceCollapseAllProps) {
	return (
		<Button
			size="xs"
			variant="ghost"
			onClick={onCollapse}
			data-testid="reference-collapse-all"
		>
			<ChevronsDownUp size={14} />
			Collapse all
		</Button>
	);
}
ReferenceCollapseAll.displayName = "ReferenceCollapseAll";
