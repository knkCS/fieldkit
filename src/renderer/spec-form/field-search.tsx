// src/renderer/spec-form/field-search.tsx
import { Box, Text } from "@chakra-ui/react";
import { SearchInput, type SearchInputHandle } from "@knkcs/anker/forms";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
	const boxRef = useRef<HTMLDivElement>(null);

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

	// anker ≥3.2 exposes a SearchInputHandle here; on anker 3.1 under
	// React 19 the ref lands on the raw <input> element instead (plain-FC
	// prop spread), which has no clear() — type-guard the method so the
	// 3.1 path falls back to the kept setQuery("") behavior instead of
	// throwing before onJump.
	const clearInput = useCallback(() => {
		const handle = searchRef.current;
		if (typeof handle?.clear === "function") handle.clear();
	}, []);

	const jump = (result: FieldSearchResult) => {
		setQuery("");
		// Also clear the visible text (anker ≥3.2; guarded no-op on 3.1).
		clearInput();
		onJump(result);
	};

	// Stable identity: anker SearchInput memoizes its debounce on
	// [onSearch, debounceMs] — an inline arrow would rebuild the debounce
	// (dropping a pending flush) on every parent re-render.
	const handleSearch = useCallback((q: string) => {
		setQuery(q);
		setHighlighted(0);
	}, []);

	// "/" focuses this search unless the user is typing in a field. Lives
	// here (not in the tab components) so every mount — edit, read, editor
	// canvas — gets the shortcut from one implementation. With multiple
	// search boxes mounted at once, the FIRST-mounted listener wins: it runs
	// first (listeners fire in registration order) and synchronously focuses
	// its own input, so by the time later listeners run, `document.activeElement`
	// is already inside a text input and their own skip-while-typing guard
	// above makes them early-return.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "/") return;
			const active = document.activeElement;
			if (
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				(active instanceof HTMLElement && active.isContentEditable)
			)
				return;
			e.preventDefault();
			const handle = searchRef.current;
			// Same anker-3.1 degrade shape as clearInput(): on 3.1 + React 19
			// the ref holds the raw <input>, whose native focus() also passes.
			if (typeof handle?.focus === "function") {
				handle.focus();
			} else {
				boxRef.current
					?.querySelector<HTMLInputElement>("[data-field-search-input]")
					?.focus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	// Contain Escape while the dropdown is open: Ark/zag dismissable layers
	// (e.g. anker's DrawerRoot) listen for Escape on `document` in the
	// CAPTURE phase, so a bubble-phase stopPropagation on the input never
	// runs first — a drawer would close (discarding edits) on the same
	// keypress that dismisses this dropdown. A window-level capture
	// listener fires before any document-capture listener (outermost-first),
	// deterministically, regardless of registration order.
	useEffect(() => {
		if (!open) return;
		const onEscapeCapture = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			// Only contain Escape aimed at this search UI: if focus/target is
			// elsewhere (e.g. a keyboard drag in the editor canvas whose
			// cancel listens on document-bubble), let it propagate untouched —
			// an unscoped intercept would swallow it (the same bug class
			// field-shell's tooltip closeOnEscape={false} defends against).
			if (!(e.target instanceof Node) || !boxRef.current?.contains(e.target)) {
				return;
			}
			e.stopPropagation();
			setQuery("");
			clearInput();
		};
		window.addEventListener("keydown", onEscapeCapture, true);
		return () => window.removeEventListener("keydown", onEscapeCapture, true);
	}, [open, clearInput]);

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
		}
	};

	return (
		<Box
			ref={boxRef}
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
