// src/renderer/fields/reference-find.tsx
import { useCallback } from "react";
import type { ReferenceFindResult } from "../../schema/reference-find";
import { findReferences } from "../../schema/reference-find";
import type { ReferenceRow } from "../../schema/reference-tree";
import { SearchCombobox } from "../search-combobox";

/**
 * How a result's ancestors are read out as one line.
 *
 * A separator rather than a nesting glyph: the line is read aloud as well as
 * looked at, and a chevron is announced as punctuation or not at all.
 */
const PATH_SEPARATOR = " / ";

export interface ReferenceFindProps {
	/** Every row of the tree — folded ones included, since a collapsed branch
	 * hiding the answer is the whole problem Find exists for. */
	rows: readonly ReferenceRow[];
	/** Resolved display names, keyed by Content id; absent falls back to the
	 * id, exactly as a row falls back. */
	names: Record<string, string>;
	/** Called with the key of the Reference an Author picked — what a Reveal
	 * names. */
	onReveal: (key: string) => void;
}

/**
 * The Reference-shaped caller of the shared search combobox: it knows what a
 * Find result is — a row in *this* tree, named by the Content it points at and
 * placed by its ancestors — and hands that to a component that does not.
 *
 * Two things it deliberately does not do:
 *
 * - **It claims no keyboard shortcut.** `slashShortcut` is left off. The claim
 *   is first-mounted-wins, and a Reference Field lives inside a form whose own
 *   search has already made it — so opting in would register a listener that
 *   could never fire, which is worse than none at all.
 * - **It never touches the tree.** Picking a result names a Reference; opening
 *   the way down to it, and landing on it, are the tree's own business. Find
 *   changes what is folded and where an Author is looking, and nothing else —
 *   so a drag is never standing on ground that moved.
 */
export function ReferenceFind({ rows, names, onReveal }: ReferenceFindProps) {
	// Called during render by the combobox, and pure — the results and the
	// dropdown's open state land in one render, which its Escape containment
	// depends on.
	const search = useCallback(
		(query: string) => findReferences(rows, names, query),
		[rows, names],
	);

	return (
		<SearchCombobox<ReferenceFindResult>
			search={search}
			describeResult={(result) => ({
				key: result.key,
				label: result.name,
				// A root sits inside nothing, so it gets no second line rather
				// than an empty one for a reader to announce.
				secondary:
					result.ancestors.length > 0
						? result.ancestors.join(PATH_SEPARATOR)
						: undefined,
			})}
			// Stacked, because an ancestor path is far too long to trail a name
			// at the end of a row — which is the case the layout exists for.
			layout="stacked"
			onSelect={(result) => onReveal(result.key)}
			placeholder="Find a Reference…"
			noResultsLabel="No matching References"
			label="Find a Reference"
			testId="reference-find"
		/>
	);
}
ReferenceFind.displayName = "ReferenceFind";
