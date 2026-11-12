// src/renderer/fields/reference-find.tsx
import { Box, IconButton, Text } from "@chakra-ui/react";
import { IconSearch, type IconSearchHandle } from "@knkcs/anker/forms";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ReferenceFindState } from "../../schema/reference-find";
import { referenceFindMatches } from "../../schema/reference-find";
import type { ReferenceRow } from "../../schema/reference-tree";

/** The search's name: its icon button's, its input's and its tooltip's. */
const FIND_LABEL = "Find a Reference";

/**
 * What the count says about the names behind it, where they are not all in.
 *
 * Appended rather than replacing the count: what Find *did* find is true in
 * every state — a match is a Reference that is in this tree — and only the
 * completeness of the number changes (#149, #152). Two reservations, because
 * they ask for different things: names still arriving will answer on their
 * own, names that failed will not. Short, because they sit in a label row
 * beside an open input.
 */
const RESERVATIONS: Record<ReferenceFindState, string> = {
	complete: "",
	resolving: " · resolving names",
	partial: " · some names unresolved",
};

/**
 * What Find says when nothing matched, by the state of the names.
 *
 * "No matches" over a set that is still arriving is a control lying about what
 * the tree contains, which is the one thing matching in the browser buys
 * (ADR-0013) — so while names arrive the sentence does not mention matching at
 * all. Keyed exhaustively: a fourth state would not compile.
 */
const NOTHING_MATCHED: Record<ReferenceFindState, string> = {
	complete: "No matches",
	resolving: "Resolving names…",
	partial: `No matches${RESERVATIONS.partial}`,
};

/** The counter's sentence: where the current match is among them all, and
 * how far that total can be trusted. */
function describeCount(
	position: number,
	total: number,
	state: ReferenceFindState,
): string {
	if (total === 0) return NOTHING_MATCHED[state];
	return `${position} of ${total}${RESERVATIONS[state]}`;
}

/** Whether a key press landed where typing a "/" means a "/". */
function isEditableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

/**
 * `/` opens the Field's search **while the Field has focus** (contenthub #637,
 * story 21) — never from anywhere on the page.
 *
 * Not anker's `shortcut`, which listens on the document: a form holds many
 * Fields, its own field search already claims `/` there, and a Reference
 * Field's search answering a key pressed in some other Field would be a search
 * nobody asked for. So the key is caught on the Field's own container instead,
 * and stopped there, so the form's search does not open as well.
 *
 * "The Field" is its value and its label row: the controls portalled into the
 * label row (`[data-field-label-actions]`) still bubble through this container
 * in React's tree. Anything else that does — a drawer the Field opens, which
 * React also bubbles through it — is not the Field and is left alone.
 */
export function useReferenceFindShortcut(): {
	/** Hand to `ReferenceFind`'s `searchRef`. */
	searchRef: RefObject<IconSearchHandle | null>;
	/** Put on the Field's container. */
	onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
} {
	const searchRef = useRef<IconSearchHandle | null>(null);
	const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
		if (event.key !== "/" || event.defaultPrevented) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target;
		if (isEditableTarget(target) || !(target instanceof Element)) return;
		const inField =
			event.currentTarget.contains(target) ||
			target.closest("[data-field-label-actions]") !== null;
		if (!inField || !searchRef.current) return;
		event.preventDefault();
		event.stopPropagation();
		searchRef.current.focus();
	}, []);
	return { searchRef, onKeyDown };
}

export interface ReferenceFindProps {
	/** Every row of the tree — folded ones included, since a collapsed branch
	 * hiding the answer is the whole problem Find exists for. */
	rows: readonly ReferenceRow[];
	/** Resolved display names, keyed by Content id; absent falls back to the
	 * id, exactly as a row falls back. */
	names: Record<string, string>;
	/**
	 * How far those names can be relied on — `referenceFindState`, resolved
	 * beside them and passed in rather than guessed at here: an id with no name
	 * reads the same whether it has not arrived or never will.
	 */
	nameState: ReferenceFindState;
	/**
	 * Reveals a match: opens the folds above it, marks it and scrolls it into
	 * view — **without moving focus**, since the Author is still typing.
	 */
	onReveal: (key: string) => void;
	/** The search's handle, from {@link useReferenceFindShortcut}, which opens
	 * it on `/`. */
	searchRef: RefObject<IconSearchHandle | null>;
}

/**
 * Find, as anker's `IconSearch` in the Field's label row: an icon that opens
 * into an input, on every non-empty tree (contenthub #642).
 *
 * Typing reveals the first match in tree order — the folds above it open, it
 * is marked and scrolled to — and the counter says where it is among them all
 * ("2 of 3") with previous and next to step through the rest; Enter and
 * Shift+Enter step too. It matches what Find always matched, the name a row
 * shows and the id behind it (ADR-0013), over every row, and is never capped:
 * a match that is counted is one an Author can reach.
 *
 * Two things it deliberately does not do:
 *
 * - **It never moves focus.** The input keeps it through every keystroke and
 *   every step; the counter, a live region, says where it landed.
 * - **It never touches the value.** Find changes what is folded and where an
 *   Author is looking, and nothing else.
 */
export function ReferenceFind({
	rows,
	names,
	nameState,
	onReveal,
	searchRef,
}: ReferenceFindProps) {
	// The query as the debounced search last settled it — what the matches are
	// answered for.
	const [query, setQuery] = useState("");
	// What the input holds right now, ahead of the debounce — so an Enter
	// pressed before the search settles answers what was typed, not the last
	// query.
	const typedRef = useRef("");
	// The query last asked, read where a closure could hold an older one.
	const queryRef = useRef("");

	/** A new question starts from its first answer, wherever the last one had
	 * been stepped to. The same question asked again (the debounce settling on
	 * what an Enter already asked) changes nothing. */
	const ask = useCallback((next: string) => {
		if (next === queryRef.current) return;
		queryRef.current = next;
		setQuery(next);
		setCurrent(null);
	}, []);
	// The match the search is on, by key; null with nothing matched.
	const [current, setCurrent] = useState<string | null>(null);

	const matches = useMemo(
		() => referenceFindMatches(rows, names, query),
		[rows, names, query],
	);

	// The latest `onReveal`, so a caller's fresh closure each render neither
	// re-runs the effect below nor goes stale inside it.
	const onRevealRef = useRef(onReveal);
	onRevealRef.current = onReveal;

	// Lands on the first match whenever the search is on none: a new query
	// (which lets go of the last one's match, below), or names arriving that
	// answer the query already typed — which is what re-answers it without the
	// Author typing it again. A match still standing under the same query is
	// kept, so a batch landing never yanks an Author back to the top while they
	// step.
	useEffect(() => {
		if (matches.length === 0) {
			setCurrent(null);
			return;
		}
		if (current !== null && matches.includes(current)) return;
		setCurrent(matches[0]);
		onRevealRef.current(matches[0]);
	}, [matches, current]);

	const step = useCallback(
		(by: 1 | -1) => {
			if (matches.length === 0) return;
			const at = current === null ? -1 : matches.indexOf(current);
			// On no match yet, next is the first and previous the last.
			const next =
				at === -1
					? matches[by === 1 ? 0 : matches.length - 1]
					: matches[(at + by + matches.length) % matches.length];
			setCurrent(next);
			onRevealRef.current(next);
		},
		[matches, current],
	);

	// Escape is contained here rather than left to the input: Ark/zag
	// dismissable layers (anker's DrawerRoot) listen for it on the document in
	// the capture phase, so an input's own bubble-phase stop never runs first,
	// and a drawer around the Field would close — discarding edits — on the
	// press that only meant to close the search. Caught on the window, earlier
	// still, and only while the search is open with focus inside it — the
	// input, or the counter's previous and next.
	const boxRef = useRef<HTMLSpanElement>(null);
	const [returnFocus, setReturnFocus] = useState(false);
	useEffect(() => {
		const onEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			const active = document.activeElement;
			const box = boxRef.current;
			if (!box || !active || !box.contains(active)) return;
			if (!box.querySelector("input")) return;
			event.stopPropagation();
			event.preventDefault();
			// What the input's own Escape does — empty and close — done for it,
			// since it never sees the key; and focus back on the icon, as anker
			// returns it.
			searchRef.current?.clear();
			setReturnFocus(true);
		};
		window.addEventListener("keydown", onEscape, true);
		return () => window.removeEventListener("keydown", onEscape, true);
	}, [searchRef]);
	useEffect(() => {
		if (!returnFocus) return;
		setReturnFocus(false);
		boxRef.current?.querySelector("button")?.focus();
	}, [returnFocus]);

	const position = current === null ? 0 : matches.indexOf(current) + 1;

	return (
		<Box
			as="span"
			ref={boxRef}
			display="inline-flex"
			alignItems="center"
			onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
				// Enter steps, as find-in-page does; Shift+Enter steps back.
				if (event.key !== "Enter") return;
				if (!(event.target instanceof HTMLInputElement)) return;
				event.preventDefault();
				// Typed ahead of the debounce: Enter asks it now, landing on its
				// first match, rather than stepping through the last query's.
				if (typedRef.current !== queryRef.current) ask(typedRef.current);
				else step(event.shiftKey ? -1 : 1);
			}}
			data-testid="reference-find"
		>
			<IconSearch
				ref={searchRef}
				label={FIND_LABEL}
				// The key is the Field's, not the page's — see
				// useReferenceFindShortcut — so it is named here rather than
				// passed as anker's `shortcut`, which would claim it document-wide.
				tooltip={`${FIND_LABEL} (/)`}
				placeholder="Find a Reference…"
				size="xs"
				onSearch={ask}
				onValueChange={(typed) => {
					typedRef.current = typed;
				}}
				counter={
					query.trim() === "" ? null : (
						<>
							<Text
								as="span"
								role="status"
								fontSize="xs"
								color="fg.muted"
								whiteSpace="nowrap"
								data-testid="reference-find-count"
							>
								{describeCount(position, matches.length, nameState)}
							</Text>
							<IconButton
								aria-label="Previous match"
								size="2xs"
								variant="ghost"
								disabled={matches.length === 0}
								onClick={() => step(-1)}
							>
								<ChevronUp size={14} />
							</IconButton>
							<IconButton
								aria-label="Next match"
								size="2xs"
								variant="ghost"
								disabled={matches.length === 0}
								onClick={() => step(1)}
							>
								<ChevronDown size={14} />
							</IconButton>
						</>
					)
				}
			/>
		</Box>
	);
}
ReferenceFind.displayName = "ReferenceFind";
