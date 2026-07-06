// src/renderer/spec-form/field-search.tsx
import { Box, Text } from "@chakra-ui/react";
import { SearchInput, type SearchInputHandle } from "@knkcs/anker/forms";
import { useCallback, useId, useRef, useState } from "react";
import type { FieldSearchResult } from "./search-index";
import { searchFields } from "./search-index";

export interface FieldSearchProps {
	index: FieldSearchResult[];
	placeholder: string;
	noResultsLabel: string;
	/** Accessible name for the search input. */
	label: string;
	onJump: (result: FieldSearchResult) => void;
}

export function FieldSearch({
	index,
	placeholder,
	noResultsLabel,
	label,
	onJump,
}: FieldSearchProps) {
	const uid = useId();
	const listboxId = `${uid}-listbox`;
	const optionId = (i: number) => `${uid}-option-${i}`;
	const searchRef = useRef<SearchInputHandle>(null);

	const [query, setQuery] = useState("");
	const [highlighted, setHighlighted] = useState(0);
	const results = searchFields(index, query);
	const open = query.trim().length > 0;
	// Derived clamp: a schema hot-swap can shrink `results` while the query
	// (and the stale `highlighted` state) survive — deriving instead of
	// clamping in an effect means Enter can never point past the end, with
	// no render-timing window. Floored too: arrowing while zero results are
	// shown stores -1, which must not survive a later regrowth.
	const safeHighlighted = results.length
		? Math.min(Math.max(highlighted, 0), results.length - 1)
		: 0;

	const jump = (result: FieldSearchResult) => {
		setQuery("");
		// Also clear the visible text (anker ≥3.2; harmless no-op ref on 3.1).
		searchRef.current?.clear();
		onJump(result);
	};

	// Stable identity: anker SearchInput memoizes its debounce on
	// [onSearch, debounceMs] — an inline arrow would rebuild the debounce
	// (dropping a pending flush) on every parent re-render.
	const handleSearch = useCallback((q: string) => {
		setQuery(q);
		setHighlighted(0);
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!open) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlighted(Math.min(safeHighlighted + 1, results.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlighted(Math.max(safeHighlighted - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (results[safeHighlighted]) jump(results[safeHighlighted]);
		} else if (e.key === "Escape") {
			// Contain the key inside the dropdown: without this, Escape also
			// bubbles to ancestors — inside EditDrawer, Chakra's drawer closes
			// on Escape too, so dismissing search results would also lose
			// the drawer's in-progress edits.
			e.stopPropagation();
			setQuery("");
			searchRef.current?.clear();
		}
	};

	return (
		<Box
			position="relative"
			maxWidth="64"
			data-testid="field-search"
			onKeyDown={handleKeyDown}
		>
			<SearchInput
				ref={searchRef}
				size="sm"
				placeholder={placeholder}
				onSearch={handleSearch}
				data-field-search-input
				role="combobox"
				aria-label={label}
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				aria-autocomplete="list"
				aria-activedescendant={
					open && results.length ? optionId(safeHighlighted) : undefined
				}
			/>
			{open && (
				<Box
					position="absolute"
					top="100%"
					right="0"
					mt="1"
					minWidth="64"
					bg="bg-surface"
					borderWidth="1px"
					borderColor="border"
					borderRadius="md"
					boxShadow="md"
					zIndex="dropdown"
				>
					<Box id={listboxId} role="listbox">
						{results.map((result, i) => (
							<Box
								key={result.accessor}
								id={optionId(i)}
								role="option"
								aria-selected={i === safeHighlighted}
								px="3"
								py="2"
								fontSize="sm"
								display="flex"
								justifyContent="space-between"
								gap="3"
								cursor="pointer"
								bg={i === safeHighlighted ? "bg-muted" : undefined}
								_hover={{ bg: "bg-muted" }}
								onClick={() => jump(result)}
							>
								<Text>{result.label}</Text>
								<Text color="fg.muted">{result.tabLabel}</Text>
							</Box>
						))}
					</Box>
					{results.length === 0 && (
						<Text role="status" px="3" py="2" fontSize="sm" color="fg.muted">
							{noResultsLabel}
						</Text>
					)}
				</Box>
			)}
		</Box>
	);
}
FieldSearch.displayName = "FieldSearch";
