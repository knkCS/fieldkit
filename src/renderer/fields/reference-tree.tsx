import {
	Box,
	Button,
	Flex,
	IconButton,
	Text,
	VisuallyHidden,
} from "@chakra-ui/react";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragMoveEvent,
	type DragStartEvent,
	type KeyboardCoordinateGetter,
	KeyboardSensor,
	MeasuringStrategy,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	type SortingStrategy,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ChevronDown,
	ChevronRight,
	GripVertical,
	Tags,
	Trash2,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { Reference } from "../../schema/reference";
import {
	countFilledAttributes,
	declaredAttributes,
} from "../../schema/reference-attributes";
import type { ReferenceRow } from "../../schema/reference-tree";
import {
	moveReferenceBranch,
	nestReferences,
	projectDropDepth,
	readReferenceTree,
	referenceBranchEnd,
	referenceDropTarget,
	removeReferenceAt,
	spliceReference,
	writeReferenceTree,
} from "../../schema/reference-tree";
import type { Field } from "../../schema/types";
import { ReferenceDropIndicator } from "./reference-drop-indicator";
import {
	ReferenceInsertSpacer,
	ReferenceInsertStrip,
} from "./reference-insert-strip";
import { useSpringLoadedBranch } from "./use-spring-loaded-branch";

/** Pixels of indentation one level of nesting is drawn at. Exported because
 * read mode draws the same tree and has to draw a level at the same width. */
export const INDENT_WIDTH = 24;

/**
 * Above this many References a tree opens with its parents collapsed; at or
 * below it, expanded.
 *
 * PROVISIONAL — a guess, not a measurement, and parent #61 says as much: the
 * threshold "wants tuning against a real Spec". Twenty rows is roughly a
 * screenful at the row height below, which is the point where an expanded
 * tree stops being something an Author takes in at a glance and starts being
 * something they scroll. Below it, collapsing would only make someone expand
 * a three-item list before they could read it.
 */
export const REFERENCE_TREE_COLLAPSE_THRESHOLD = 20;

/** Whether a Reference has anything under it to fold away. */
function hasBranch(row: ReferenceRow): boolean {
	return row.height > 0;
}

/** The rows an Author can see: everything not inside a collapsed Reference. */
function visibleRows(
	rows: readonly ReferenceRow[],
	collapsed: ReadonlySet<string>,
): ReferenceRow[] {
	const shown: ReferenceRow[] = [];
	let hiddenThrough = -1;
	rows.forEach((row, index) => {
		if (index <= hiddenThrough) return;
		shown.push(row);
		if (hasBranch(row) && collapsed.has(row.key)) {
			hiddenThrough = referenceBranchEnd(rows, index);
		}
	});
	return shown;
}

/**
 * Carries the collapsed set across a change of shape, `before[i]` being the
 * row `after[i]` used to be.
 *
 * A row is keyed by where it sits, so a move renames it — and a branch that
 * was collapsed before a drag has to still be collapsed after one, or an
 * Author's first drag would spring the tree open.
 */
function carryCollapsed(
	before: readonly { key: string }[],
	after: readonly { key: string }[],
	collapsed: ReadonlySet<string>,
): Set<string> {
	const carried = new Set<string>();
	after.forEach((row, index) => {
		const was = before[index];
		if (was && collapsed.has(was.key)) carried.add(row.key);
	});
	return carried;
}

/** The collapsed set a tree opens with — see the threshold above. */
function initialCollapsed(rows: readonly ReferenceRow[]): Set<string> {
	if (rows.length <= REFERENCE_TREE_COLLAPSE_THRESHOLD) return new Set();
	return new Set(rows.filter(hasBranch).map((row) => row.key));
}

/** What {@link resolveDrop} is asked: a drag, as the two lists see it. */
interface DropResolutionInput {
	/** Every row, folded ones included — the list a move reorders. */
	rows: readonly ReferenceRow[];
	/** The rows on screen — the list a depth is offered against. */
	shown: readonly ReferenceRow[];
	collapsed: ReadonlySet<string>;
	activeKey: string;
	overKey: string | null;
	/** How far the drag has travelled horizontally. */
	offsetX: number;
	depthCeiling: number | undefined;
}

/** Where a drag would land, in the terms the model works in. */
interface ResolvedDrop {
	activeIndex: number;
	overIndex: number;
	depth: number;
	/**
	 * The keys of the rows releasing here would take as descendants —
	 * `projectDropDepth`'s `adopted`, named rather than re-derived.
	 *
	 * Adoption restructures rows the Author never picked up, so the drag has to
	 * say so before the release (ADR-0012); a mid-drag highlight computed from
	 * some second reading of the rule is exactly how a label comes to disagree
	 * with what letting go does.
	 */
	adopted: ReadonlySet<string>;
	/**
	 * The key of the row *on screen* the branch would land immediately before,
	 * or null when it would land after the last one — `referenceDropTarget`'s
	 * answer, which reads the same `dropSlot` rule the release splices at.
	 *
	 * A key rather than an index because the gaps are drawn against the list
	 * that still holds the dragged branch, while the landing is an index into
	 * the list without it. Naming the row that follows the landing is the one
	 * expression both lists agree on.
	 */
	landsBefore: string | null;
}

/** The rows a release would produce — the move applied over every row, folded
 * ones included. */
function landedRows(
	rows: readonly ReferenceRow[],
	{ activeIndex, overIndex, depth }: ResolvedDrop,
): ReferenceRow[] {
	return moveReferenceBranch({ items: rows, activeIndex, overIndex, depth });
}

/**
 * Whether releasing would rewrite nothing: every row still where it was, at the
 * depth it was already at.
 *
 * One predicate, read twice. The release uses it to leave the stored value
 * alone rather than dirtying the form for nothing, and the indicator uses it to
 * stay dark — so the tree can never draw a landing that letting go would
 * decline to perform.
 */
function writesNothing(
	rows: readonly ReferenceRow[],
	moved: readonly ReferenceRow[],
): boolean {
	return moved.every(
		(row, index) =>
			row.key === rows[index].key && row.depth === rows[index].depth,
	);
}

/** Which gap a release would land in, and at what level. */
interface DropLanding {
	/** The gap among the rows on screen, numbered as the insertion strips are. */
	slot: number;
	/** The level it would land at, bounds already applied. */
	depth: number;
}

/**
 * Where the drop indicator draws, or null for a drag drawing none.
 *
 * Everything here comes off `pending`, the resolution the release itself reads:
 * the depth arrives clamped by the neighbours, by the `max_depth` ceiling and
 * by the dragged branch's own height, and the slot is the one
 * `moveReferenceBranch` splices at. No bound and no rule is re-derived — an
 * indicator that answered "where" from a second reading of the rules is exactly
 * how a line comes to promise something letting go does not do.
 *
 * Null for an **exact no-op**, judged by the very predicate the release uses to
 * decline the write. So the line marks a change or it marks nothing, and an
 * in-place re-indent — where the slot is unchanged but the depth is not — is
 * the case it is the only signal for.
 */
function dropLanding(
	rows: readonly ReferenceRow[],
	shown: readonly ReferenceRow[],
	pending: ResolvedDrop | null,
): DropLanding | null {
	if (pending === null) return null;
	if (writesNothing(rows, landedRows(rows, pending))) return null;
	// Landing after the last row on screen is the trailing gap, which is the
	// slot the strips already number `shown.length`.
	const slot =
		pending.landsBefore === null
			? shown.length
			: shown.findIndex((row) => row.key === pending.landsBefore);
	// A key that no longer names a row on screen: `pending` is state and `shown`
	// is derived, so a value arriving mid-drag can re-shape one without the
	// other. Drawing nothing for a frame beats drawing a landing in a gap that
	// has moved.
	return slot === -1 ? null : { slot, depth: pending.depth };
}

/**
 * What the drag says out loud while a release would adopt — empty when it
 * would not, which is the ordinary case and wants no announcement at all.
 *
 * It counts exactly the rows it marks, which are rows on screen: a folded
 * Reference counts once and stands in for everything it hides, the same way
 * dropping below one lands below its whole branch. So the count and the
 * outlines always describe the same tree an Author is looking at, and a fold
 * changes both together rather than making one of them lie.
 *
 * The wording is the insertion strip's too — see `describeInsert`, whose
 * clause reads "…, adopting 2 References" off the same projection under the
 * same counting rule. Two affordances naming one outcome differently is how an
 * Author learns to distrust both, so the two strings move together or not at
 * all.
 */
function adoptionNotice(count: number): string {
	if (count <= 0) return "";
	return `Adopting ${String(count)} ${count === 1 ? "Reference" : "References"}`;
}

/**
 * Resolves a drag — the one answer both the live indent and the release read,
 * so what an Author watches is what letting go does. The precedent is the
 * editor canvas's `resolveDropTarget`.
 *
 * It reads the two lists for two different things, and the split is the whole
 * point:
 *
 * - **Order comes from every row.** A branch travels with its Reference
 *   whether or not it is folded away, so the move is expressed over the full
 *   list. A collapsed Reference stands in for everything it hides, so landing
 *   below one means below its whole branch.
 * - **Depth comes from the rows on screen.** A drop may only reach a depth an
 *   Author can see: a folded Reference offers itself as a parent, never the
 *   descendants hidden under it. Projecting against the full list would let a
 *   drag reach a depth whose neighbours are invisible.
 */
function resolveDrop({
	rows,
	shown,
	collapsed,
	activeKey,
	overKey,
	offsetX,
	depthCeiling,
}: DropResolutionInput): ResolvedDrop | null {
	const activeIndex = rows.findIndex((row) => row.key === activeKey);
	if (activeIndex === -1) return null;

	const over = rows.findIndex((row) => row.key === overKey);
	// Over nothing that resolves is a drag hovering its own row: no move, but
	// still a depth the pointer may have asked for.
	let overIndex = over === -1 ? activeIndex : over;
	if (overIndex > activeIndex && collapsed.has(rows[overIndex].key)) {
		overIndex = referenceBranchEnd(rows, overIndex);
	}

	// The dragged row is always on screen — it is the one carrying the grip.
	const shownActive = shown.findIndex((row) => row.key === activeKey);
	const shownOver = shown.findIndex((row) => row.key === overKey);
	// One over-index for both halves of the answer, so the slot the indicator
	// draws in and the depth it draws at describe one landing.
	const shownOverIndex = shownOver === -1 ? shownActive : shownOver;
	const { depth, adopted } = projectDropDepth({
		items: shown,
		activeIndex: shownActive,
		overIndex: shownOverIndex,
		offsetX,
		indentWidth: INDENT_WIDTH,
		depthCeiling,
	});
	return {
		activeIndex,
		overIndex,
		depth,
		adopted: new Set(adopted.map((row) => row.key)),
		// Against the rows on screen, for the same reason the depth is: a gap an
		// Author cannot see is not one a landing can be drawn in.
		landsBefore:
			referenceDropTarget({
				items: shown,
				activeIndex: shownActive,
				overIndex: shownOverIndex,
			})?.key ?? null,
	};
}

/**
 * The keys of everything the branch now at `index` sits inside.
 *
 * A drop may land under a Reference that is folded, and a Reference has to be
 * visible where it was dropped — so what it landed inside is unfolded.
 */
function ancestorKeys(
	rows: readonly { depth: number; key: string }[],
	index: number,
): string[] {
	const keys: string[] = [];
	let depth = rows[index]?.depth ?? 0;
	for (let above = index - 1; above >= 0 && depth > 0; above--) {
		if (rows[above].depth < depth) {
			keys.push(rows[above].key);
			depth = rows[above].depth;
		}
	}
	return keys;
}

/** The key of the row a drag event is carrying. */
function draggedKey(event: DragMoveEvent | DragEndEvent | DragStartEvent) {
	return String(event.active.id);
}

/**
 * What the drag's own events say about it: the row underneath, and how far it
 * has travelled sideways.
 *
 * The *events* are held rather than the resolution they produce, because the
 * resolution also depends on what is folded — and a spring changes that mid-drag
 * without any event firing. Storing the reading and deriving the answer is what
 * keeps the indent, the marking and the landing line describing the tree as it
 * stands now rather than as it stood when the pointer last moved.
 */
interface DragReading {
	overKey: string | null;
	offsetX: number;
}

/** What a drag event says, in those terms. */
function readingOf(event: DragMoveEvent | DragEndEvent): DragReading {
	return {
		overKey: event.over ? String(event.over.id) : null,
		offsetX: event.delta.x,
	};
}

/**
 * A drag in flight, as this control has to remember it.
 *
 * One record rather than four states, because they are one lifetime: all of
 * them are born at the lift and all of them die at the release, and a
 * half-cleared drag — a fold snapshot outliving the row it was taken for — is
 * exactly the shape of bug the restore rules below could not survive.
 */
interface DragSession {
	/** The row being carried. */
	activeKey: string;
	/**
	 * Whether a pointer is carrying it. Only a pointer dwells: arrowing onto a
	 * Reference is deliberate already, and a keyboard drop into a folded branch
	 * lands at its end and unfolds it without needing one (Decision 8).
	 */
	pointer: boolean;
	/**
	 * The fold as it stood at the lift — what a drop or a cancel restores to
	 * (Decisions 7 and 9).
	 *
	 * A drag changes the fold twice over: the dragged branch closes on lift, and
	 * every folded Reference the drag rests on springs open. Both are previews.
	 * Restoring from this snapshot rather than from the live set is what makes
	 * them one rule instead of two undo paths — a cancel replays it as it
	 * stands, a drop replays it through `carryCollapsed`, since a move renames
	 * every key it passes.
	 */
	foldsAtLift: ReadonlySet<string>;
	/** What its own events last said, or null before it has moved. */
	reading: DragReading | null;
}

/**
 * The folded Reference a drag is resting on, or null when it is resting on
 * nothing that could spring.
 *
 * The dragged Reference itself is never one, whatever the fold set says about
 * it: its branch is folded *because* it is in flight (Decision 7), and springing
 * it back open would undo the one thing that made every remaining row a legal
 * target.
 */
function springableKey(
	rows: readonly ReferenceRow[],
	collapsed: ReadonlySet<string>,
	drag: DragSession | null,
): string | null {
	const overKey = drag?.reading?.overKey;
	if (!drag || overKey == null || overKey === drag.activeKey) return null;
	if (!collapsed.has(overKey)) return null;
	const row = rows.find((candidate) => candidate.key === overKey);
	return row && hasBranch(row) ? overKey : null;
}

/** The fold set with `key` folded away — the very same set when it already is,
 * so a no-op write never re-renders the tree. */
function foldedWith(
	current: ReadonlySet<string>,
	key: string,
): ReadonlySet<string> {
	return current.has(key) ? current : new Set([...current, key]);
}

/** The fold set with `key` open — the very same set when it already is. */
function foldedWithout(
	current: ReadonlySet<string>,
	key: string,
): ReadonlySet<string> {
	if (!current.has(key)) return current;
	const next = new Set(current);
	next.delete(key);
	return next;
}

/**
 * How the tree measures its droppables, named rather than inherited.
 *
 * `WhileDragging` **is** dnd-kit's default, and this says so on purpose: the
 * tree now changes shape *during* a drag (Decisions 7 and 8), so what was a
 * default it never thought about is a dependency it has. Checked against the
 * installed 6.3.1/8.0.0 sources, mounting and unmounting re-measure themselves
 * — a droppable registering or unregistering replaces the containers map, and a
 * new map identity makes `useDroppableMeasuring` re-measure *every* container,
 * so rows that merely moved are covered too; `SortableContext` asks for the
 * same thing again whenever its `items` change mid-drag. `docs/dnd-kit-reference.md`
 * carries the detail.
 *
 * `Always` was tried and does the same work plus measuring between drags, which
 * is cost with no answer attached — the sibling spring-loaded-sections spec's
 * rule, "correctness first, then the cheapest strategy that re-measures on the
 * swap", picks this one.
 *
 * A module constant because an inline literal is a fresh identity every render,
 * which re-runs dnd-kit's `useMeasuringConfiguration` memo and churns its
 * public context for nothing.
 */
const TREE_MEASURING = {
	droppable: { strategy: MeasuringStrategy.WhileDragging },
} as const;

/**
 * The list holds still: no row displaces to open a gap for the one in flight
 * (Decision 10, which reverses Decision 2).
 *
 * Decision 2 kept `verticalListSortingStrategy` on the reasoning that the
 * canvas's problem — flat-strategy translations escaping its nested card frames
 * — is not the tree's, which is true and was never the whole question. What
 * settles it is springs: a list that both parts *and* springs moves twice for
 * one gesture, and the row it moves is the one being aimed at.
 *
 * **The engine detail this rests on, verified rather than assumed.**
 * `useSortable` computes
 * `finalTransform = displaceItem ? (dragSourceDisplacement ?? strategy({…})) : null`,
 * so returning null leaves every row the strategy is asked about untransformed.
 * It is never asked about the dragged row: with no `DragOverlay` mounted,
 * `shouldDisplaceDragSource = !useDragOverlay && isDragging` is true for the
 * active row, `dragSourceDisplacement` is dnd-kit's raw drag delta, and it
 * short-circuits the strategy entirely. That is why Decision 10 does not
 * collapse into the overlay Decision 11 declines: the list can stop parting and
 * the dragged row can still follow the pointer.
 *
 * Read off the installed @dnd-kit/sortable 8.0.0 `useSortable` source, because
 * a wrong guess here does not fail loudly — it produces a drag with nothing
 * following the pointer, which jsdom cannot see. The editor canvas's own no-op
 * strategy leans on the *other* half of the same expression: its overlay makes
 * `useDragOverlay` true, so its active node falls through to the strategy and
 * stays put while the clone travels.
 */
const stillListStrategy: SortingStrategy = () => null;

/**
 * The name a row about to exist is carried under while the collapsed set is
 * carried across an insert.
 *
 * `carryCollapsed` pairs the two lists by index, so the list *before* an
 * insert has to hold a place for the arriving row. Every real key is an index
 * path — digits and dots — so this one can never collide with, or be found in,
 * the set it is passed through.
 */
const ARRIVING_ROW = "+";

/**
 * Arrow keys drive a tree drag: up and down step through the rows, left and
 * right change how deeply the drop nests — one level per press, the same
 * distance a pointer would have to travel for it.
 *
 * `sortableKeyboardCoordinates` reads left and right as "find a droppable
 * that way", which in a single column finds nothing. Intercepting them here
 * is what puts nesting within reach of someone who never touches a pointer.
 */
const treeKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
	if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
		const step = event.code === "ArrowRight" ? INDENT_WIDTH : -INDENT_WIDTH;
		return { ...args.currentCoordinates, x: args.currentCoordinates.x + step };
	}
	return sortableKeyboardCoordinates(event, args);
};

/**
 * A click on an insertion strip: where a Reference would go, and the way to
 * put one there.
 *
 * The two halves are split across the two controls because that is where the
 * knowledge is. The tree knows the position — including the translation from
 * the rows on screen to the rows in the value, which is what puts an insert
 * under a folded Reference at the end of its branch — and it owns the write,
 * because folding has to follow one. Only the Field can produce a Reference:
 * it holds the Adapter and the browse drawer. So the tree hands out the
 * position with the write already bound to it, and the Field calls `commit`
 * once someone has chosen a Content.
 *
 * `commit` reads the tree as it stood when the strip was clicked. The drawer
 * is modal, so nothing an Author can do in between changes it.
 */
export interface ReferenceInsertRequest {
	/**
	 * Where the Reference would go, as an index into the *stored* tree's rows —
	 * every row, not only the ones on screen.
	 */
	slot: number;
	/** The depth it would land at — what the strip was offering when it was
	 * clicked. */
	depth: number;
	/**
	 * What the strip said clicking it would do — the Reference the new one will
	 * sit under or beside, and the rows it will adopt where any would.
	 *
	 * It travels with the position because whatever opens next has to say the
	 * same thing (ADR-0012: the announcement is part of the decision), and by
	 * then the strip's label is off the screen. A caller re-deriving it would be
	 * one phrasing free to disagree with the one an Author already read.
	 */
	destination: string;
	/** Puts a Reference there, and hands the whole next value to `onChange`. */
	commit: (reference: Reference) => void;
}

export interface ReferenceTreeProps {
	/** The rows to render — `readReferenceTree` of the stored value. */
	rows: readonly ReferenceRow[];
	/** The stored value itself, which a remove splices and a drop rewrites. */
	value: unknown;
	/** Resolved display names, keyed by Content id; absent falls back to the id. */
	names: Record<string, string>;
	readOnly?: boolean;
	/** Hands the whole value back; the caller writes it to the form. */
	onChange: (next: unknown[]) => void;
	/**
	 * The deepest depth a drop may land at, roots being 0. Absent leaves the
	 * neighbours the only bound.
	 *
	 * A depth *index*, not a count of levels: the Reference Field fills it in
	 * from its `max_depth` setting through `referenceDepthCeiling`, which is
	 * where that conversion lives. Clamping here is a courtesy — the Field's
	 * Schema is what actually refuses a tree that is too deep, including one
	 * that arrived already too deep.
	 */
	depthCeiling?: number;
	/**
	 * The Attribute Spec the Field declares. Empty — the ordinary case — puts
	 * no Attributes affordance on any row: there is nothing to fill in, and a
	 * count of nothing is noise.
	 */
	attributeSpec?: Field[];
	/** Opens the Attributes of one Reference. The drawer belongs to the Field,
	 * which is the only thing that knows the Accessor its paths hang off. */
	onOpenAttributes?: (row: ReferenceRow) => void;
	/**
	 * Asked to find a Content for an insertion strip somebody clicked, with the
	 * write to perform once one is chosen (see {@link ReferenceInsertRequest}).
	 *
	 * Absent puts no strips on the tree at all, which is what a Consumer
	 * assembling its own control around this one gets until it has a browse of
	 * its own to open: only its Adapter can produce a Reference.
	 */
	onInsert?: (request: ReferenceInsertRequest) => void;
	/**
	 * Whether the tree is already holding `max_items`, which disables the
	 * strips exactly as it disables the Field's own Add control.
	 *
	 * A boolean rather than the cap itself, because reading a cap is where the
	 * `?? 0` mistake lives: an unset `max_items` is *no* cap, and
	 * `referenceItemCap` in `/schema` is what says so.
	 */
	atItemCap?: boolean;
}

/**
 * A Reference Tree: rows an Author can reorder, nest and collapse.
 *
 * Three things worth knowing about how it works:
 *
 * - **The tree is the value; the flat list is scaffolding.** Every drag
 *   flattens (ADR-0008 calls that an implementation detail of the Field),
 *   asks `projectDropDepth` where the release lands, moves the branch with
 *   `moveReferenceBranch` and re-nests. None of that arithmetic lives here,
 *   so none of it is asserted through a DOM.
 * - **A branch travels whole.** Dragging a Reference takes its descendants
 *   with it, at the depths they held relative to it — collapsed or not, and
 *   whatever it lands inside is unfolded so it can be seen where it went.
 * - **Folding is this control's own state, never the value's.** It is seeded
 *   from how big the tree was when it opened, and it follows a Reference
 *   through a move rather than being reset by one. Nothing about which
 *   branches are folded is ever stored.
 *
 * An **insertion strip** sits in every gap between rows, and before the first
 * one, so a Reference can be added where it belongs rather than at the end and
 * then dragged. It is the same round trip as a drag with a different pair of
 * neighbours: `projectInsertDepth` for the depth and the rows it would adopt,
 * `spliceReference` to put one entry in the flat list, `nestReferences` back to
 * a value — so adoption (ADR-0012) is not an operation anything here performs.
 */
export function ReferenceTree({
	rows,
	value,
	names,
	readOnly,
	onChange,
	depthCeiling,
	attributeSpec,
	onOpenAttributes,
	onInsert,
	atItemCap,
}: ReferenceTreeProps) {
	// Seeded once, from the tree as it first arrived: a threshold is about
	// what opens on screen, so adding a Reference must not collapse the tree
	// an Author is working in.
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() =>
		initialCollapsed(rows),
	);
	// The drag in flight, or null when none is — see {@link DragSession}.
	const [drag, setDrag] = useState<DragSession | null>(null);
	const activeKey = drag?.activeKey ?? null;
	// What the strip an Author is on has just moved to, or null when nobody is
	// operating one. Held here rather than in the strip because there are as
	// many strips as there are gaps and a control wants one voice — see the
	// live regions at the foot of this component.
	const [insertPreview, setInsertPreview] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: treeKeyboardCoordinates }),
	);

	const shown = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed]);

	/**
	 * Where a reading of a drag would land, against the tree as it stands *now*.
	 *
	 * The one resolution both the live feedback and the release read, so what an
	 * Author watches is what letting go does — see {@link resolveDrop}.
	 */
	function resolveReading(key: string, read: DragReading): ResolvedDrop | null {
		return resolveDrop({
			rows,
			shown,
			collapsed,
			activeKey: key,
			overKey: read.overKey,
			offsetX: read.offsetX,
			depthCeiling,
		});
	}

	// The drag as it currently reads — the depth the dragged row indents to and
	// the rows a release would adopt, held together because they are one answer
	// and showing half of it is what makes an adoption silent.
	//
	// Derived rather than stored, and re-derived on every render rather than
	// memoised. `shown` changes under a running drag every time a branch folds
	// or springs, so a resolution held from the last pointer move would go on
	// naming a gap that has moved — and a memo would have to list every input
	// the resolution reads to avoid the same staleness by another route. There
	// is no drag most of the time, which is a null and a return; while there is
	// one, it is a few linear passes over the rows, which is what the resolution
	// costs whenever the pointer moves anyway.
	const pending: ResolvedDrop | null =
		drag?.reading == null ? null : resolveReading(drag.activeKey, drag.reading);

	// Decision 8: rest a pointer drag on a folded Reference and it opens, so a
	// slot inside it becomes something an Author can aim at. Nothing is
	// committed by it — Decision 9 folds it back unless the drop lands inside.
	useSpringLoadedBranch({
		pendingKey: springableKey(rows, collapsed, drag),
		enabled: drag?.pointer ?? false,
		onSpring: (key) => setCollapsed((current) => foldedWithout(current, key)),
	});

	// The Attributes an Author is actually being asked for — a hidden one is
	// neither counted nor rendered, so a row cannot say "1 of 2" with only one
	// control behind it.
	const askedFor = useMemo(
		() => declaredAttributes(attributeSpec ?? []),
		[attributeSpec],
	);

	function toggle(key: string) {
		setCollapsed((current) =>
			current.has(key) ? foldedWithout(current, key) : foldedWith(current, key),
		);
	}

	/** The one reading of a drag, from whichever event carries it. */
	function resolveFrom(
		event: DragMoveEvent | DragEndEvent,
	): ResolvedDrop | null {
		return resolveReading(draggedKey(event), readingOf(event));
	}

	function handleRemove(row: ReferenceRow) {
		// The branch goes with it, so the rows left behind are the ones either
		// side of that slice — which is what the folded set has to follow.
		const from = rows.indexOf(row);
		const end = referenceBranchEnd(rows, from);
		const kept = rows.filter((_, index) => index < from || index > end);
		const next = removeReferenceAt(value, row.path);
		setCollapsed(carryCollapsed(kept, readReferenceTree(next), collapsed));
		onChange(next);
	}

	/**
	 * Puts one Reference in at `slot` and `depth`, and hands the whole next
	 * value back — the insert's half of the round trip a drag already makes.
	 *
	 * Nothing rewrites anyone's parentage: `spliceReference` moves no other
	 * row, and the rows that follow a shallower arrival become its children
	 * purely because `nestReferences` reads a list by order and depth
	 * (ADR-0012). What has to be maintained is the folding, which is keyed by
	 * position and so is renamed by an insert: the set is carried across the
	 * change of shape, and whatever the Reference landed *inside* is unfolded,
	 * on the same terms a drop into a folded branch already gets.
	 */
	function insertReference(slot: number, depth: number, reference: Reference) {
		const at = Math.max(0, Math.min(slot, rows.length));
		const placed = spliceReference({ items: rows, reference, slot: at, depth });
		const next = writeReferenceTree(value, nestReferences(placed));
		// `placed` and the rows the new value reads back as are both depth-first
		// over the same tree, so an index means the same row in either.
		const nextRows = readReferenceTree(next);
		const before = [
			...rows.slice(0, at),
			{ key: ARRIVING_ROW },
			...rows.slice(at),
		];
		const carried = carryCollapsed(before, nextRows, collapsed);
		for (const key of ancestorKeys(nextRows, at)) carried.delete(key);

		setCollapsed(carried);
		onChange(next);
	}

	/**
	 * A strip was clicked. The slot it names is among the rows *on screen*; the
	 * write is over every row, so the two have to be reconciled — and the row
	 * below the strip is what reconciles them, since that is the row the
	 * Reference lands before whether or not anything between them is folded
	 * away. A strip under a folded Reference therefore lands at the end of its
	 * branch, which is what a drop into one already does.
	 */
	function handleInsert(shownSlot: number, depth: number, destination: string) {
		const below = shown[shownSlot];
		const slot = below ? rows.indexOf(below) : rows.length;
		onInsert?.({
			slot,
			depth,
			// Passed along exactly as the strip announced it, never rebuilt: the
			// slot has just been translated from the rows on screen to every row,
			// and re-reading the neighbours through that translation would answer
			// a different question.
			destination,
			commit: (reference) => insertReference(slot, depth, reference),
		});
	}

	/**
	 * A lift. Besides recording the drag, this is where the dragged Reference's
	 * own branch folds away (Decision 7).
	 *
	 * Its descendants are not legal targets and have not been since #65 —
	 * `projectDropDepth` excises the branch before reading its neighbours — but
	 * nothing said so, and on a large branch they were most of what an Author
	 * was looking at. Folding says it: every row still on screen is a row a
	 * release could land against.
	 *
	 * It cannot loosen the depth cap, and that is worth stating rather than
	 * assuming. `height` is measured by `flattenReferences` from the **tree**,
	 * never from the visible list, so a branch folded away is exactly as tall as
	 * it was. knkCMS core has the bug that comes from doing it the other way
	 * (`docs/core-reference-tree-comparison.md` §5.2).
	 */
	function handleDragStart(event: DragStartEvent) {
		const key = draggedKey(event);
		setDrag({
			activeKey: key,
			// The KeyboardSensor activates on a keydown; every pointer activator
			// is a *down event. The same test the editor canvas makes.
			pointer: event.activatorEvent?.type !== "keydown",
			// Snapshotted before anything is folded, because this is what the
			// drop and the cancel both restore to.
			foldsAtLift: collapsed,
			reading: null,
		});
		const lifted = rows.find((row) => row.key === key);
		if (lifted && hasBranch(lifted)) {
			setCollapsed((current) => foldedWith(current, key));
		}
		// The strips become spacers for the duration, so whatever one of them
		// was offering has stopped being true. React fires no blur for an
		// element that simply unmounts, so nothing else would clear it.
		setInsertPreview(null);
	}

	/**
	 * Re-reads the drag — bound to `onDragMove` *and* `onDragOver`, because
	 * neither event is current on its own.
	 *
	 * dnd-kit dispatches `onDragMove` from an effect keyed on the translation
	 * and `onDragOver` from one keyed on the row underneath, in that order; the
	 * first therefore carries the row the drag was over *before* this step
	 * whenever a step changed both. Listening to the move alone leaves the
	 * feedback one event behind the release, which is the one thing feedback
	 * for a restructuring drop may not be (ADR-0012). The two fire in the same
	 * flush, so the fresher answer is the one that lands.
	 */
	function handleDragUpdate(event: DragMoveEvent) {
		setDrag((current) =>
			current === null ? null : { ...current, reading: readingOf(event) },
		);
	}

	/**
	 * Escape. Nothing is written, and every fold goes back to what it was at the
	 * lift — the branch this drag closed and any a spring opened alike
	 * (Decision 9). Nothing moved, so the keys still name the same rows.
	 */
	function handleDragCancel() {
		if (drag) setCollapsed(drag.foldsAtLift);
		setDrag(null);
	}

	function handleDragEnd(event: DragEndEvent) {
		// The fold a drop restores to, which is the one from before the branch
		// closed and before anything sprang — never the live set, which is
		// halfway through a preview.
		const atLift = drag?.foldsAtLift ?? collapsed;
		const resolved = resolveFrom(event);
		setDrag(null);
		if (!resolved) {
			setCollapsed(atLift);
			return;
		}

		const moved = landedRows(rows, resolved);
		// A drag that ended where it started: leave the stored value alone
		// rather than rewriting it, which would dirty the form for nothing. The
		// indicator reads the same predicate, so a drag drawing a line always
		// had something to write. The fold still unwinds — a preview that
		// committed nothing is a preview.
		if (writesNothing(rows, moved)) {
			setCollapsed(atLift);
			return;
		}

		const next = writeReferenceTree(value, nestReferences(moved));
		// `moved` and the rows the new value reads back as are both depth-first
		// over the same tree, so an index means the same row in either.
		const nextRows = readReferenceTree(next);
		const carried = carryCollapsed(moved, nextRows, atLift);
		const landed = moved.findIndex((row) => row.key === draggedKey(event));
		// Unfold whatever the branch landed inside: a Reference has to be
		// visible where it was dropped. This is also the one exception to the
		// restore above — a branch that sprang open *and* received the drop
		// stays open, because it is now an ancestor of what landed in it
		// (Decision 9, which is #65's rule seen from the other side).
		for (const key of ancestorKeys(nextRows, landed)) carried.delete(key);

		setCollapsed(carried);
		onChange(next);
	}

	// No strips without somewhere to put a Reference *between*: an empty tree
	// has no gaps, and the Field's Add control is its way in.
	const stripsOffered = !readOnly && onInsert !== undefined && shown.length > 0;

	// Where the release would land, for the one gap that draws it.
	const landing = dropLanding(rows, shown, pending);

	/**
	 * The gap at `slot`: a strip, the line saying a release would land here, or
	 * the inert spacer a drag replaces a strip with everywhere else.
	 *
	 * All three are one geometry — see `INSERT_SLOT_HEIGHT` — so a drag starting,
	 * and a landing moving from one gap to another, shift nothing.
	 *
	 * Which is also why a tree offering no strips draws no landing either: the
	 * gap it would draw in is the one the strips reserve, and conjuring 4px of
	 * it the moment a row is lifted would push every row below it down. A
	 * Consumer assembling its own control without an `onInsert` therefore gets
	 * the lifted, re-indenting row as its only drop feedback.
	 */
	function insertionGap(slot: number) {
		if (!stripsOffered) return null;
		if (activeKey !== null) {
			return landing?.slot === slot ? (
				<ReferenceDropIndicator
					slot={slot}
					depth={landing.depth}
					indentWidth={INDENT_WIDTH}
				/>
			) : (
				<ReferenceInsertSpacer />
			);
		}
		return (
			<ReferenceInsertStrip
				rows={shown}
				slot={slot}
				names={names}
				indentWidth={INDENT_WIDTH}
				depthCeiling={depthCeiling}
				disabled={atItemCap ?? false}
				onInsert={handleInsert}
				onAnnounce={setInsertPreview}
			/>
		);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			// The tree unmounts rows on lift and mounts them mid-drag
			// (Decisions 7 and 8), so how it measures is a dependency rather than
			// a default it never thought about — see {@link TREE_MEASURING}.
			measuring={TREE_MEASURING}
			onDragStart={handleDragStart}
			onDragMove={handleDragUpdate}
			onDragOver={handleDragUpdate}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<SortableContext
				items={shown.map((row) => row.key)}
				strategy={stillListStrategy}
			>
				{shown.map((row, index) => (
					<Fragment key={row.key}>
						{insertionGap(index)}
						<ReferenceTreeRowItem
							row={row}
							name={names[row.reference.id] ?? row.reference.id}
							// The dragged row indents to where releasing would put it,
							// and the rows it would take are marked — both from the
							// same resolution the release itself uses.
							depth={
								row.key === activeKey && pending ? pending.depth : row.depth
							}
							adopted={pending?.adopted.has(row.key) ?? false}
							collapsed={collapsed.has(row.key)}
							readOnly={readOnly ?? false}
							attributesAsked={askedFor.length}
							attributesFilled={countFilledAttributes(
								askedFor,
								row.reference.attributes,
							)}
							onToggle={() => toggle(row.key)}
							onRemove={() => handleRemove(row)}
							onOpenAttributes={
								onOpenAttributes ? () => onOpenAttributes(row) : undefined
							}
						/>
					</Fragment>
				))}
				{insertionGap(shown.length)}
			</SortableContext>
			{/* Always rendered, empty and all: a live region an Author's screen
			    reader only meets once the drag has already started is one it may
			    never announce. Marking the rows says it to anyone watching; this
			    says it to anyone dragging from the keyboard. */}
			<Text
				role="status"
				fontSize="xs"
				color="accent"
				data-testid="reference-adoption-notice"
			>
				{adoptionNotice(pending?.adopted.size ?? 0)}
			</Text>
			{/* One region per affordance, and never both speaking: the strips are
			    spacers for as long as a drag is running. Two, rather than one
			    shared, because they say different things — a drag reports only
			    what it would restructure, while a strip reports its whole
			    sentence — and a region that changed subject would make an
			    interrupted announcement read as a correction to the last one.

			    Hidden, unlike the drag's, because the strip already draws its
			    sentence on itself: a second copy under the tree would say to
			    everyone what only a screen reader is missing. */}
			<VisuallyHidden role="status" data-testid="reference-insert-notice">
				{insertPreview ?? ""}
			</VisuallyHidden>
		</DndContext>
	);
}
ReferenceTree.displayName = "ReferenceTree";

interface ReferenceTreeRowItemProps {
	row: ReferenceRow;
	name: string;
	/** What to draw at — the row's own depth, or where a drag would land it. */
	depth: number;
	/** Whether a drag in flight would take this row as a descendant. */
	adopted: boolean;
	collapsed: boolean;
	readOnly: boolean;
	/** How many Attributes the Field declares. Zero puts no affordance on the
	 * row at all. */
	attributesAsked: number;
	/** How many of them this Reference has answered. */
	attributesFilled: number;
	onToggle: () => void;
	onRemove: () => void;
	onOpenAttributes?: () => void;
}

function ReferenceTreeRowItem({
	row,
	name,
	depth,
	adopted,
	collapsed,
	readOnly,
	attributesAsked,
	attributesFilled,
	onToggle,
	onRemove,
	onOpenAttributes,
}: ReferenceTreeRowItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: row.key,
		// No settle transforms, for the same reason the editor canvas passes
		// this: the default answers a row's index changing by re-transforming it
		// from the rect it used to occupy. The tree changes shape *during* a drag
		// by design — the dragged branch folds away on lift and a folded one
		// springs open on a dwell (Decisions 7 and 8) — so leaving it on would
		// put a displacement transform back on rows the still-list strategy has
		// just taken it off, by a second route (Decision 10).
		animateLayoutChanges: () => false,
	});
	const hasChildren = row.height > 0;

	return (
		<Flex
			ref={setNodeRef}
			style={{
				// The dragged row travels vertically only. Without a
				// `DragOverlay`, `useSortable` hands the *active* row dnd-kit's raw
				// drag delta on both axes — see {@link stillListStrategy}, which is
				// the same fact read from the other end — while `ml` below is
				// separately set to the depth a release would land at. So a
				// continuous sideways travel would ride on top of a quantised 24px
				// indent, and the quantised part is the answer to "what level is
				// this". Dropping the horizontal component leaves the indent the
				// only thing saying it (drag-feedback spec 2026-08-05, Decision 1).
				//
				// Appearance only: the projection reads the drag *event's*
				// `delta.x`, which nothing here touches, so ←/→ keep changing the
				// depth exactly as before.
				//
				// The `isDragging` guard is what keeps this honest now that the
				// still list gives every other row a null transform anyway: this
				// rewrites the one row that has a transform at all, rather than
				// blanket-flattening an axis for rows whose transform is somebody
				// else's to produce.
				transform: CSS.Translate.toString(
					isDragging && transform ? { ...transform, x: 0 } : transform,
				),
				transition,
			}}
			align="center"
			justify="space-between"
			gap="2"
			mb="2"
			ml={`${depth * INDENT_WIDTH}px`}
			px="3"
			py="2"
			bg="bg.muted"
			borderRadius="md"
			// So the lift below has a stacking context to be raised in. Offsetless,
			// so it moves nothing.
			position="relative"
			// An outline rather than a border: a marked row must not move, or
			// the feedback would restructure the very list it is describing.
			{...(adopted
				? { outline: "2px solid", outlineColor: "accent", outlineOffset: "1px" }
				: {})}
			// Decision 12: the dragged row is *lifted*, not dimmed — opaque, raised
			// above its neighbours and shadowed, so it reads as a card being
			// carried over the list rather than a ghost blended into it. The 0.5
			// dim it replaces existed to say "this one is moving"; the indicator
			// says where it is going now, so being able to read *what* is in hand
			// matters more. And with the list no longer parting (Decision 10) the
			// row overlaps what it passes — two translucent rows stacked is
			// precisely the thing to avoid.
			zIndex={isDragging ? "1" : undefined}
			boxShadow={isDragging ? "lg" : undefined}
			data-testid="reference-row"
			// Whether this is the row in flight — the same fact the lift draws,
			// for a test to read and a Consumer to style against, on the terms
			// `data-adopted` below is already offered on.
			data-lifted={isDragging ? "true" : undefined}
			// The row's depth, for a test to read and for a Consumer to style
			// against without measuring pixels.
			data-depth={depth}
			// Whether releasing would take this row — the same fact the outline
			// draws, for a test to read and a Consumer to style against.
			data-adopted={adopted ? "true" : undefined}
		>
			<Flex align="center" gap="1" minWidth="0">
				{!readOnly && (
					<IconButton
						aria-label={`Reorder ${name}`}
						size="xs"
						variant="ghost"
						{...attributes}
						{...listeners}
					>
						<GripVertical size={14} />
					</IconButton>
				)}
				{hasChildren ? (
					<IconButton
						aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
						aria-expanded={!collapsed}
						size="xs"
						variant="ghost"
						onClick={onToggle}
					>
						{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
					</IconButton>
				) : (
					// Keeps the names of siblings on one line whether or not they
					// carry a branch.
					<Box width="6" flexShrink={0} />
				)}
				<Text fontSize="sm" data-testid="reference-row-name">
					{name}
				</Text>
			</Flex>
			<Flex align="center" gap="1" flexShrink={0}>
				{attributesAsked > 0 && onOpenAttributes && (
					// Available read-only too: reading what a Reference says about
					// the pointing is reading, and the count is only useful if the
					// thing it counts can be looked at.
					<Button
						size="xs"
						variant="ghost"
						onClick={onOpenAttributes}
						// The count is on screen as well, but a name that reads
						// "Attributes for Cats of the world: 1 of 2 filled" is the
						// only version of it a screen reader gets in one go.
						aria-label={`Attributes for ${name}: ${String(attributesFilled)} of ${String(attributesAsked)} filled`}
						data-testid="reference-attributes-button"
					>
						<Tags size={14} />
						<Text
							as="span"
							fontSize="xs"
							data-testid="reference-attribute-count"
						>
							{attributesFilled}/{attributesAsked}
						</Text>
					</Button>
				)}
				{!readOnly && (
					<IconButton
						aria-label={`Remove ${name}`}
						size="xs"
						variant="ghost"
						onClick={onRemove}
					>
						<Trash2 size={14} />
					</IconButton>
				)}
			</Flex>
		</Flex>
	);
}
ReferenceTreeRowItem.displayName = "ReferenceTreeRowItem";
