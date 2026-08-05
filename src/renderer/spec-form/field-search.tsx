// src/renderer/spec-form/field-search.tsx
import { useCallback } from "react";
import { SearchCombobox } from "../search-combobox";
import type { FieldSearchResult } from "./search-index";
import { searchFields } from "./search-index";

export interface FieldSearchProps {
	index: FieldSearchResult[];
	placeholder: string;
	noResultsLabel: string;
	/** Accessible name for the search input. */
	label: string;
	onJump: (result: FieldSearchResult) => void;
	/** Claim the global "/" shortcut; off unless asked — see `SearchCombobox`. */
	slashShortcut?: boolean;
}

/**
 * The field-shaped caller of the shared search combobox: it knows what a
 * Field result is (an accessor, a name, the tab it sits on) and hands that
 * knowledge to a component that does not. Everything else — the combobox
 * roles, the keyboard model, the Escape containment — lives there, once.
 */
export function FieldSearch({
	index,
	placeholder,
	noResultsLabel,
	label,
	onJump,
	slashShortcut,
}: FieldSearchProps) {
	// No `countLabel`: a Spec's fields are a set an Author already scrolls in
	// full, so this search lists everything it found and has nothing to say
	// about a cap it does not apply.
	const search = useCallback(
		(query: string) => ({ results: searchFields(index, query) }),
		[index],
	);

	return (
		<SearchCombobox<FieldSearchResult>
			search={search}
			describeResult={(result) => ({
				key: result.accessor,
				label: result.label,
				secondary: result.tabLabel,
			})}
			onSelect={onJump}
			placeholder={placeholder}
			noResultsLabel={noResultsLabel}
			label={label}
			slashShortcut={slashShortcut}
			testId="field-search"
		/>
	);
}
FieldSearch.displayName = "FieldSearch";
