// src/renderer/spec-form/field-search.tsx
import { Box, Text } from "@chakra-ui/react";
import { SearchInput } from "@knkcs/anker/forms";
import { useState } from "react";
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
	const [query, setQuery] = useState("");
	const [highlighted, setHighlighted] = useState(0);
	const results = searchFields(index, query);
	const open = query.trim().length > 0;

	const jump = (result: FieldSearchResult) => {
		setQuery("");
		onJump(result);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!open) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlighted((h) => Math.min(h + 1, results.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlighted((h) => Math.max(h - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (results[highlighted]) jump(results[highlighted]);
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
				onSearch={(q) => {
					setQuery(q);
					setHighlighted(0);
				}}
				data-field-search-input
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
								role="option"
								aria-selected={i === highlighted}
								px="3"
								py="2"
								fontSize="sm"
								display="flex"
								justifyContent="space-between"
								gap="3"
								cursor="pointer"
								bg={i === highlighted ? "bg-muted" : undefined}
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
