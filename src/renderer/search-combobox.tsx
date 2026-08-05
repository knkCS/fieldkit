// src/renderer/search-combobox.tsx
import { Box, Text, useSafeLayoutEffect } from "@chakra-ui/react";
import { SearchInput, type SearchInputHandle } from "@knkcs/anker/forms";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * How one result is shown. The combobox knows nothing else about what it
 * lists — every caller keeps its own result type and describes it here.
 */
export interface SearchComboboxResultDisplay {
	/** Stable identity for the result row (its React key). */
	key: string;
	/** Primary line: the name the person searching typed towards. */
	label: string;
	/**
	 * Optional second line placing the primary one — the tab a field sits on,
	 * the ancestors above a Reference. Omit it for one-line results.
	 */
	secondary?: string;
}

/** Everything one search answered: what to list, and what to say about it. */
export interface SearchComboboxAnswer<T> {
	/** The results to list, in the order they should be read. */
	results: T[];
	/**
	 * How the results read as a count — "20 of 431 matches" for a caller that
	 * caps its list, so the person searching knows to keep typing rather than
	 * reading the cap as the whole answer.
	 *
	 * It travels **in the answer** rather than as a prop of its own, and that is
	 * the whole point: the list and the sentence about the list come out of one
	 * call, so they cannot be computed from two different questions and disagree
	 * about what was found. A caller that lists everything it found may leave it
	 * out, and then no count is shown at all.
	 *
	 * The words are the caller's, as `noResultsLabel` and `placeholder` already
	 * are — a combobox agnostic about what it lists cannot know whether it is
	 * counting matches, fields or References. Where the line sits, and that it
	 * is announced, are this component's.
	 */
	countLabel?: string;
}

export interface SearchComboboxProps<T> {
	/**
	 * The caller's own matching, called during render with the current query.
	 * Must be pure: results are derived, never stored, so the dropdown's open
	 * state and its contents can never disagree (see the Escape containment
	 * below, which depends on both landing in one render).
	 */
	search: (query: string) => SearchComboboxAnswer<T>;
	/** How to show one of the caller's results. */
	describeResult: (result: T) => SearchComboboxResultDisplay;
	/** Called with the caller's own result object — never a copy. */
	onSelect: (result: T) => void;
	placeholder: string;
	/** Shown, announced, when the query matches nothing. */
	noResultsLabel: string;
	/** Accessible name for the search input. */
	label: string;
	/**
	 * `"inline"` (the default) trails the secondary at the end of the row;
	 * `"stacked"` puts it on its own line under the label, which is what a
	 * long secondary — an ancestor path — needs.
	 *
	 * Two modes rather than one because both are load-bearing: a one-word
	 * tab name reads as a trailing column, and stacking it would change a
	 * screen nobody asked to change; a path is too long to trail anything.
	 */
	layout?: "inline" | "stacked";
	/**
	 * Claim the global "/" shortcut — see the effect that implements it for
	 * why the claim is first-mounted-wins and therefore opt-in. Leave it off
	 * and this combobox puts no key listener on `document` at all; the only
	 * global listener it ever registers is the Escape containment below,
	 * which exists solely while its own dropdown is open and only answers
	 * Escapes aimed at its own node.
	 */
	slashShortcut?: boolean;
	/** `data-testid` for the container, so each caller's search is findable. */
	testId?: string;
}

export function SearchCombobox<T>({
	search,
	describeResult,
	onSelect,
	placeholder,
	noResultsLabel,
	label,
	layout = "inline",
	slashShortcut = false,
	testId,
}: SearchComboboxProps<T>) {
	const uid = useId();
	const listboxId = `${uid}-listbox`;
	const optionId = (i: number) => `${uid}-option-${i}`;
	const searchRef = useRef<SearchInputHandle>(null);
	const boxRef = useRef<HTMLDivElement>(null);

	const [query, setQuery] = useState("");
	const [highlighted, setHighlighted] = useState(0);
	const { results, countLabel } = search(query);
	const open = query.trim().length > 0;
	// Derived clamp: a caller's result set can shrink (a schema hot-swap, a
	// tree edit) while the query — and the stale `highlighted` state —
	// survive; deriving instead of clamping in an effect means Enter can
	// never point past the end, with no render-timing window. Floored too:
	// arrowing while zero results are shown stores -1, which must not
	// survive a later regrowth.
	const safeHighlighted = results.length
		? Math.min(Math.max(highlighted, 0), results.length - 1)
		: 0;

	// anker ≥3.2 exposes a SearchInputHandle here; on anker 3.1 under
	// React 19 the ref lands on the raw <input> element instead (plain-FC
	// prop spread), which has no clear() — type-guard the method so the
	// 3.1 path falls back to the kept setQuery("") behavior instead of
	// throwing before onSelect.
	const clearInput = useCallback(() => {
		const handle = searchRef.current;
		if (typeof handle?.clear === "function") handle.clear();
	}, []);

	const select = (result: T) => {
		setQuery("");
		// Also clear the visible text (anker ≥3.2; guarded no-op on 3.1).
		clearInput();
		onSelect(result);
	};

	// Stable identity: anker SearchInput memoizes its debounce on
	// [onSearch, debounceMs] — an inline arrow would rebuild the debounce
	// (dropping a pending flush) on every parent re-render.
	const handleSearch = useCallback((q: string) => {
		setQuery(q);
		setHighlighted(0);
	}, []);

	// "/" focuses this search unless the user is typing in a field — and only
	// for a caller that asked for it. With more than one claimant mounted at
	// once, the FIRST-mounted listener wins: it runs first (listeners fire in
	// registration order) and synchronously focuses its own input, so by the
	// time later listeners run, `document.activeElement` is already inside a
	// text input and their own skip-while-typing guard makes them
	// early-return. That is why the claim is opt-in: a search nested inside
	// another one's screen would always lose, and would rather register
	// nothing than a listener that can never fire.
	useEffect(() => {
		if (!slashShortcut) return;
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
					?.querySelector<HTMLInputElement>("[data-search-combobox-input]")
					?.focus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [slashShortcut]);

	// Contain Escape while the dropdown is open: Ark/zag dismissable layers
	// (e.g. anker's DrawerRoot) listen for Escape on `document` in the
	// CAPTURE phase, so a bubble-phase stopPropagation on the input never
	// runs first — a drawer would close (discarding edits) on the same
	// keypress that dismisses this dropdown. A window-level capture
	// listener fires before any document-capture listener (outermost-first),
	// deterministically, regardless of registration order.
	//
	// A LAYOUT effect, not a passive one (#82). `open` is derived synchronously
	// from `query`, so the listbox and `open === true` land in one render — but
	// that render is reached from anker's DEBOUNCED onSearch, i.e. from a timer
	// rather than from a discrete user event, and React defers a timer-lane
	// render's passive effects to a later task instead of flushing them with
	// the render. A passive listener therefore attaches after the dropdown is
	// already painted, and an Escape arriving in between closes the surrounding
	// drawer and discards the Author's edits — the exact thing this listener
	// exists to prevent. A layout effect runs before paint, so "visible" and
	// "contained" cannot separate.
	//
	// Via Chakra's `useSafeLayoutEffect` (useLayoutEffect in the browser,
	// useEffect where there is no `document`) rather than the raw hook: it is
	// the wrapper already in this tree, so this stays one pattern rather than a
	// new one. Note the once-standard reason is now stale — React 19, the
	// minimum this package supports, no longer warns about a layout effect
	// during server rendering; the wrapper is kept for being free and correct
	// on whatever renderer a Consumer actually has.
	//
	// Note this listener exists only while the dropdown is open, and answers
	// only Escapes aimed at this node — it is not a claim on a key the way
	// the "/" shortcut above is, which is why a caller that opts out of that
	// one still gets this.
	useSafeLayoutEffect(() => {
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
			if (results[safeHighlighted]) select(results[safeHighlighted]);
		}
	};

	const stacked = layout === "stacked";

	return (
		<Box
			ref={boxRef}
			position="relative"
			maxWidth="64"
			data-testid={testId}
			onKeyDown={handleKeyDown}
		>
			<SearchInput
				ref={searchRef}
				size="sm"
				placeholder={placeholder}
				onSearch={handleSearch}
				data-search-combobox-input
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
					{countLabel !== undefined && results.length > 0 && (
						// Above the list, not under it: a capped list is exactly the
						// case where the line saying so would sit below more rows
						// than fit on screen. `role="status"` so it is announced
						// when it changes, which is what tells a reader who never
						// sees the twenty rows that there were four hundred.
						//
						// Only ever one status line in this dropdown: this one needs
						// results to count, `noResultsLabel` below needs there to be
						// none, and two sentences about one answer is how they come
						// to disagree.
						<Text
							role="status"
							px="3"
							pt="2"
							pb="1"
							fontSize="xs"
							color="fg.muted"
						>
							{countLabel}
						</Text>
					)}
					<Box id={listboxId} role="listbox">
						{results.map((result, i) => {
							const shown = describeResult(result);
							return (
								<Box
									key={shown.key}
									id={optionId(i)}
									role="option"
									aria-selected={i === safeHighlighted}
									// The layout is otherwise carried entirely by
									// emotion class names, which jsdom cannot resolve
									// — this is what makes the variant assertable, and
									// a styling hook besides.
									data-layout={layout}
									px="3"
									py="2"
									fontSize="sm"
									display="flex"
									flexDirection={stacked ? "column" : "row"}
									alignItems={stacked ? "flex-start" : undefined}
									justifyContent={stacked ? undefined : "space-between"}
									gap={stacked ? "0.5" : "3"}
									cursor="pointer"
									bg={i === safeHighlighted ? "bg-muted" : undefined}
									_hover={{ bg: "bg-muted" }}
									onClick={() => select(result)}
								>
									<Text>{shown.label}</Text>
									{shown.secondary !== undefined && (
										<Text
											color="fg.muted"
											fontSize={stacked ? "xs" : undefined}
										>
											{shown.secondary}
										</Text>
									)}
								</Box>
							);
						})}
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
SearchCombobox.displayName = "SearchCombobox";
