// src/renderer/fields/reference-read.tsx
import { Box, IconButton, Text, VisuallyHidden } from "@chakra-ui/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import type { ReadProps } from "../../schema/plugin";
import { declaredAttributes } from "../../schema/reference-attributes";
import type { ReferenceRow } from "../../schema/reference-tree";
import {
	foldsToReveal,
	initialReferenceFolds,
	readReferenceTree,
	referenceDisplayName,
	referenceHasBranch,
	referenceTreeOpensFolded,
	visibleReferenceRows,
} from "../../schema/reference-tree";
import type { Field } from "../../schema/types";
import { useResolvedContentNames } from "../hooks/use-resolved-content-names";
import { EmptyReadValue } from "./empty-value";
import { ReferenceCollapseAll } from "./reference-collapse-all";
import { ReferenceFind } from "./reference-find";
import { INDENT_WIDTH } from "./reference-tree";

/**
 * A Reference Tree in read mode: the same structure editing shows, resolved
 * and static.
 *
 * It bypasses `ReferenceCell` for the reason ADR-0008 gives. A cell has
 * neither Adapter access nor async, so a count is the honest answer at table
 * density — the alternative is a row of raw ids. Read mode sits inside the
 * renderer, reaches the adapter, and so can show what the tree actually holds:
 * every Content's current name, at the depth it sits at, with the Attribute
 * values that belong to it.
 *
 * It **folds, and it finds** (#153). A tree past
 * the tree model's collapse threshold opens with its parents collapsed
 * and carries a Find control, exactly as the editable tree does — an Author
 * opening a record read-only with ten thousand References was previously given
 * ten thousand rows, which is the problem collapsing already solved on the
 * other side of the same Field. Folds open and close while reading, because
 * reading a folded branch is reading.
 *
 * This stays a separate component from {@link ReferenceTree} — one has grips,
 * drags and springs, this has none of them — but every rule about *what a fold
 * hides and what a Reveal opens* is called from the tree model rather than
 * restated here: `initialReferenceFolds`, `visibleReferenceRows` and
 * `foldsToReveal`. Two renderers that owned copies of those rules would be two
 * renderers free to disagree about the same tree (#88, which this narrows
 * without closing).
 *
 * Two things it deliberately does not do:
 *
 * - **It never touches react-hook-form.** Read mode renders without a
 *   `FormProvider` in the tree, so the value arrives as a prop and the
 *   Attributes are rendered from the record rather than registered as paths —
 *   which is what separates this from the Attributes drawer.
 * - **It never writes.** Folding and the Reveal's mark are this component's own
 *   state, as folding already is in the editable tree; nothing here changes the
 *   value it was handed. It also never stores or trusts a name: names are
 *   resolved on every load, and a Content that no longer resolves keeps its id
 *   on screen (ADR-0008), through the tree model's own `referenceDisplayName`.
 *
 * The indentation is the editing control's, imported rather than restated:
 * "reading conveys the same structure as editing" is only true if the two draw
 * a level at the same width.
 */
export function ReferenceReadValue({
	field,
	value,
	renderChild,
}: ReadProps<ReferenceSettings>) {
	// Read rather than cast: form data arrives from a Consumer and is only as
	// well-formed as whatever produced it. Anything that is not a Reference
	// yields no row, at any level.
	const rows = useMemo(() => readReferenceTree(value), [value]);

	const names = useResolvedContentNames(
		rows.map((row) => row.reference.id),
		field.config.api_accessor,
	);

	// The Attributes someone filling in the form was actually asked for — the
	// same skip the drawer and the row count make, so a read-mode row cannot
	// show an Attribute no drawer offers.
	const attributes = useMemo(
		() => declaredAttributes(field.settings?.attributes ?? []),
		[field.settings?.attributes],
	);

	// Seeded once, from the tree as it first arrived, and by the same function
	// the editable tree seeds from — one threshold, and one answer to what a
	// tree that size opens as.
	const [folded, setFolded] = useState<ReadonlySet<string>>(() =>
		initialReferenceFolds(rows),
	);
	// The Reference the last Reveal landed on, marked until the next one. A
	// Reveal is an answer to a question, not a preview: nothing folds it back.
	//
	// Neither this nor the fold set is carried across a change of *value*, the
	// way the editable tree carries both across its own writes. It has to,
	// because a key names a position and its writes rename them; nothing read
	// mode does writes, so the only way the rows can change under it is a
	// Consumer handing it another record — and an answer about the last record
	// is not an answer about this one. Resetting on the rows' identity is what
	// is deliberately *not* done: a Consumer that builds its value inline hands
	// a fresh array down on every render, and folds an Author opened would come
	// undone under them.
	const [revealed, setRevealed] = useState<string | null>(null);
	// The Reference a Reveal has asked for but not yet landed on. A ref rather
	// than state because it is consumed by the landing rather than rendered, and
	// writing it must not itself schedule a render — the render that matters is
	// the one opening the folds, which the landing waits for.
	const pendingRevealRef = useRef<string | null>(null);
	// Every row's node, by key. Scoped to this tree rather than found through a
	// document query: a record may show several Reference Fields, and a key is
	// an index path, so the same key names a row in every one of them.
	const rowNodes = useRef(new Map<string, HTMLElement>());

	const registerRow = useCallback((key: string, node: HTMLElement | null) => {
		if (node) rowNodes.current.set(key, node);
		else rowNodes.current.delete(key);
	}, []);

	const shown = useMemo(
		() => visibleReferenceRows(rows, folded),
		[rows, folded],
	);

	const toggle = useCallback((key: string) => {
		setFolded((current) => {
			const next = new Set(current);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	}, []);

	/**
	 * Collapse all: back to the fold set this tree opened in, by calling the
	 * function it opened with rather than restating what that function does.
	 *
	 * A read-mode tree sprawls on exactly the terms the editable one does —
	 * Reveals accumulate, and a fold opened by hand stays open — so it wants the
	 * same way back, and gets it from the same rule. The Reveal's mark is left
	 * where it is: it says what was last asked for, and folding its row away
	 * answers nothing.
	 */
	const collapseAll = useCallback(() => {
		setFolded(initialReferenceFolds(rows));
	}, [rows]);

	/**
	 * The landing: focus a revealed row and put it in the middle of the
	 * viewport — what the editable tree does, for the same reasons.
	 *
	 * Focus rather than scroll alone, because a Reveal has to be findable by
	 * someone who is not looking at the screen. Answers whether it landed: a
	 * row inside a branch that is still committing has no node yet.
	 */
	const landOn = useCallback((key: string) => {
		const node = rowNodes.current.get(key);
		if (!node) return false;
		node.focus();
		// Optional-called: jsdom implements no scrolling, and neither does a
		// Consumer's test renderer.
		node.scrollIntoView?.({ block: "center", behavior: "smooth" });
		return true;
	}, []);

	/**
	 * A Reveal: open the way down to the Reference somebody named, mark it, and
	 * land on it.
	 *
	 * `foldsToReveal` is the whole of what this writes into the fold set — the
	 * ancestors that are shut, and nothing else — so Reveals **accumulate**
	 * here exactly as they do in the editable tree: an earlier Reveal's folds
	 * stay open, a fold opened by hand is never fought, and the revealed
	 * Reference's own branch stays as it was.
	 *
	 * The landing is attempted at once and deferred only when it has to be.
	 * A row already on screen is one nothing has to open for, and asking for it
	 * again changes no state at all — React would bail out before committing,
	 * so an effect is exactly what would *not* run on the ask an Author makes
	 * by scrolling away and wanting back. A row still hidden has no node to
	 * focus yet, so it waits for the commit that opens its ancestors.
	 *
	 * This is where the editable tree needs a token instead: its ask crosses a
	 * prop boundary, and the same key twice is the same prop.
	 */
	const handleReveal = useCallback(
		(key: string) => {
			const index = rows.findIndex((row) => row.key === key);
			// A key naming no row: nothing to reveal, and nothing to say about it.
			if (index === -1) return;
			setFolded((current) => {
				const opening = foldsToReveal(rows, index, current);
				// The same set back when it was already open, so a Reveal of a row
				// on screen re-renders nothing.
				if (opening.length === 0) return current;
				const next = new Set(current);
				for (const ancestor of opening) next.delete(ancestor);
				return next;
			});
			setRevealed(key);
			pendingRevealRef.current = landOn(key) ? null : key;
		},
		[rows, landOn],
	);

	/**
	 * The deferred half of that landing, for a row whose ancestors had to open
	 * first.
	 *
	 * Run after **every** commit, deliberately, rather than keyed on the rows
	 * on screen: the branches a Reveal opens may take more than one commit to
	 * arrive. The pending ref is what makes running often free — with no Reveal
	 * outstanding this is a read and a return.
	 */
	useEffect(() => {
		const key = pendingRevealRef.current;
		if (key == null) return;
		if (landOn(key)) pendingRevealRef.current = null;
	});

	if (rows.length === 0) return <EmptyReadValue />;

	// Find and Collapse all appear on exactly the trees that open collapsed —
	// the same threshold, read through the same function the editable Field and
	// tree read it through, so no two of them can come to different answers
	// about the same tree. One reading rather than two, because they are one
	// judgement: a tree big enough to be met a level at a time is one worth
	// carrying a way in and a way back out of.
	//
	// Size is the whole test, deliberately. The editable Field offers no Find
	// with no Adapter configured, but only because it replaces itself with a
	// message and draws no tree at all; read mode draws one whatever resolves,
	// so its screen in that case is the *same* screen a failed lookup leaves —
	// every row showing its id — and ADR-0013 already has Find matching those.
	// A control present on one and absent on the other would be a difference an
	// Author can see and cannot explain.
	const opensFolded = referenceTreeOpensFolded(rows);

	// What the last Reveal landed on, named — null until one has.
	const revealedRow =
		revealed === null ? undefined : rows.find((row) => row.key === revealed);

	return (
		// Spans throughout, and label/value pairs written out rather than an
		// anker `DescriptionList`: read mode renders every value inside a
		// `DescriptionList.Row`, which is a `<p>`, and a `<div>` anywhere under
		// one is invalid HTML. `DescriptionList` is div-based, so nesting one
		// here would put divs inside that `<p>`.
		//
		// The rows keep that rule; the Find control below cannot. It is the
		// shared combobox, whose input group is a `<div>` inside anker — and a
		// second, span-only Find would be exactly the duplicate control this
		// ticket exists to avoid. `GroupReadValue` already renders `<div>`s in
		// the same slot, so the honest reading is that read mode's value
		// container is a `<p>` that has outgrown one, rather than that this
		// component is the exception.
		<Box
			as="span"
			display="flex"
			flexDirection="column"
			gap="2"
			// anker's horizontal `DescriptionList.Row` right-aligns its value, and
			// that inherits. Left-aligned here or the indentation would be
			// invisible: every name would end at the same right edge whatever
			// depth it sits at, and depth is the thing this rendering exists to
			// show.
			textAlign="start"
			data-testid="reference-read-tree"
		>
			{opensFolded && (
				// Above the tree and on the right, where the editable Field draws
				// Find and the editable tree draws Collapse all under it — one
				// condition and one order, so the pair reads the same on both
				// sides of the Field rather than as four separate controls.
				<>
					<Box as="span" display="flex" justifyContent="flex-end">
						<ReferenceFind rows={rows} names={names} onReveal={handleReveal} />
					</Box>
					<Box as="span" display="flex" justifyContent="flex-end">
						<ReferenceCollapseAll onCollapse={collapseAll} />
					</Box>
				</>
			)}

			{shown.map((row) => (
				<ReferenceReadRow
					key={row.key}
					row={row}
					name={referenceDisplayName(row, names)}
					registerNode={registerRow}
					folded={folded.has(row.key)}
					revealed={row.key === revealed}
					onToggle={toggle}
					attributes={attributes}
					renderChild={renderChild}
				/>
			))}

			{/* A Reveal moves focus onto a row that is a row rather than a
			    control, so what a screen reader announces on arrival is whatever
			    the row happens to contain — and in read mode that is a name and
			    some Attribute values, with nothing to say which of them was
			    asked for. This says it outright, and only once a Reveal has
			    actually landed; the mark on the row is what says it to everyone
			    else. */}
			<VisuallyHidden role="status" data-testid="reference-read-reveal-notice">
				{revealedRow
					? `Revealed ${referenceDisplayName(revealedRow, names)}`
					: ""}
			</VisuallyHidden>
		</Box>
	);
}
ReferenceReadValue.displayName = "ReferenceReadValue";

interface ReferenceReadRowProps {
	row: ReferenceRow;
	/** What the row shows for the Content it points at — the resolved name, or
	 * the id where none resolved. */
	name: string;
	/** Hands this row's node to the tree, so a Reveal can land on it without
	 * querying a document that may hold several trees. */
	registerNode: (key: string, node: HTMLElement | null) => void;
	/** Whether this Reference's own branch is shut. */
	folded: boolean;
	/** Whether the last Reveal landed here — marked until the next one. */
	revealed: boolean;
	onToggle: (key: string) => void;
	/** The Attributes the Field declares, already filtered to the ones an
	 * Author was asked for. */
	attributes: Field[];
	renderChild: ReadProps<ReferenceSettings>["renderChild"];
}

/** One row of the read-mode tree: its name at its depth, its fold control, and
 * whatever the Reference says about the pointing. */
function ReferenceReadRow({
	row,
	name,
	registerNode,
	folded,
	revealed,
	onToggle,
	attributes,
	renderChild,
}: ReferenceReadRowProps) {
	// One stable callback rather than a fresh closure per render: React detaches
	// and reattaches a ref whose identity changed, which is churn on exactly the
	// large trees folding exists for.
	const setRowRef = useCallback(
		(node: HTMLElement | null) => {
			registerNode(row.key, node);
		},
		[registerNode, row.key],
	);

	return (
		<Box
			ref={setRowRef}
			as="span"
			display="block"
			// A row is not a control, and this does not make it one: it is -1, so
			// it never joins the tab order and nothing changes for someone tabbing
			// through the page. It exists so a Reveal can put focus *on the
			// Reference*, which is what lets a screen reader arrive at the row.
			tabIndex={-1}
			ml={`${String(row.depth * INDENT_WIDTH)}px`}
			borderLeftWidth="2px"
			borderColor="border"
			pl="3"
			// An outline rather than a border: a marked row must not move, or the
			// mark would restructure the very list it is describing. Dashed, as
			// the editable tree draws a Reveal.
			{...(revealed
				? {
						outline: "2px dashed",
						outlineColor: "accent",
						outlineOffset: "1px",
					}
				: {})}
			data-testid="reference-read-row"
			// The row's depth, for a test to read and for a Consumer to style
			// against without measuring pixels — the same attribute the editing
			// control puts on its rows.
			data-depth={row.depth}
			// Whether the last Reveal landed here, on the same terms the editable
			// tree offers it — and said to a screen reader as well as drawn,
			// because a mark that only exists as an outline is a mark half the
			// Authors here never get.
			data-revealed={revealed ? "true" : undefined}
			aria-current={revealed ? "true" : undefined}
		>
			<Box as="span" display="flex" alignItems="center" gap="1">
				{referenceHasBranch(row) ? (
					<IconButton
						aria-label={folded ? `Expand ${name}` : `Collapse ${name}`}
						aria-expanded={!folded}
						size="xs"
						variant="ghost"
						onClick={() => onToggle(row.key)}
					>
						{folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
					</IconButton>
				) : (
					// Keeps the names of siblings on one line whether or not they
					// carry a branch — the editing control's rule, for the same
					// reason.
					<Box as="span" display="block" width="6" flexShrink={0} />
				)}
				<Text as="span" display="block" data-testid="reference-read-name">
					{name}
				</Text>
			</Box>
			{attributes.map((attribute) => (
				<Box
					key={attribute.config.api_accessor}
					as="span"
					display="flex"
					gap="2"
					alignItems="baseline"
					data-testid="reference-read-attribute"
				>
					<Text as="span" fontSize="sm" color="fg.muted" flexShrink={0}>
						{attribute.config.name}
					</Text>
					{/* An Attribute is an ordinary Field, so its value reads the
					    way any Field's value reads — a number Attribute through the
					    number plugin's cell, a boolean as Yes or No. Nothing here
					    has a case for either. */}
					<Box as="span" display="block" minWidth="0">
						{renderChild(
							attribute,
							row.reference.attributes?.[attribute.config.api_accessor],
						)}
					</Box>
				</Box>
			))}
		</Box>
	);
}
ReferenceReadRow.displayName = "ReferenceReadRow";
