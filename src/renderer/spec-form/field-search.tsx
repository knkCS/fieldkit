// src/renderer/spec-form/field-search.tsx
import { Box, Text } from "@chakra-ui/react";
import { SearchInput } from "@knkcs/anker/forms";
import { useCallback, useId, useState } from "react";
import type { FieldSearchResult } from "./search-index";
import { searchFields } from "./search-index";

export interface FieldSearchProps {
	index: FieldSearchResult[];
	placeholder: string;
	noResultsLabel: string;
	onJump: (result: FieldSearchResult) => void;
}

export function FieldSearch({
	index,
	placeholder,
	noResultsLabel,
	onJump,
}: FieldSearchProps) {
	const uid = useId();
	const listboxId = `${uid}-listbox`;
	const optionId = (i: number) => `${uid}-option-${i}`;

	const [query, setQuery] = useState("");
	const [highlighted, setHighlighted] = useState(0);
	const results = searchFields(index, query);
	const open = query.trim().length > 0;
	// Derived clamp: a schema hot-swap can shrink `results` while the query
	// (and the stale `highlighted` state) survive — deriving instead of
	// clamping in an effect means Enter can never point past the end, with
	// no render-timing window.
	const safeHighlighted = results.length
		? Math.min(highlighted, results.length - 1)
		: 0;

	const jump = (result: FieldSearchResult) => {
		setQuery("");
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
				size="sm"
				placeholder={placeholder}
				onSearch={handleSearch}
				data-field-search-input
				role="combobox"
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				aria-autocomplete="list"
				aria-activedescendant={
					open && results.length ? optionId(safeHighlighted) : undefined
				}
			/>
			{open && (
				<Box
					id={listboxId}
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
					role="listbox"
				>
					{results.length === 0 ? (
						<Text px="3" py="2" fontSize="sm" color="fg.muted">
							{noResultsLabel}
						</Text>
					) : (
						results.map((result, i) => (
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
						))
					)}
				</Box>
			)}
		</Box>
	);
}
FieldSearch.displayName = "FieldSearch";
