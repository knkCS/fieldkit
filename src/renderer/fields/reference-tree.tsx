import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragMoveEvent,
	type DragStartEvent,
	type KeyboardCoordinateGetter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
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
	removeReferenceAt,
	spliceReference,
	writeReferenceTree,
} from "../../schema/reference-tree";
import type { Field } from "../../schema/types";
import {
	ReferenceInsertSpacer,
	ReferenceInsertStrip,
} from "./reference-insert-strip";

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
	const { depth, adopted } = projectDropDepth({
		items: shown,
		activeIndex: shownActive,
		overIndex: shownOver === -1 ? shownActive : shownOver,
		offsetX,
		indentWidth: INDENT_WIDTH,
		depthCeiling,
	});
	return {
		activeIndex,
		overIndex,
		depth,
		adopted: new Set(adopted.map((row) => row.key)),
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
	const [activeKey, setActiveKey] = useState<string | null>(null);
	// The drag as it currently reads — the depth the dragged row indents to and
	// the rows a release would adopt, held together because they are one answer
	// and showing half of it is what makes an adoption silent.
	const [pending, setPending] = useState<ResolvedDrop | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: treeKeyboardCoordinates }),
	);

	const shown = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed]);

	// The Attributes an Author is actually being asked for — a hidden one is
	// neither counted nor rendered, so a row cannot say "1 of 2" with only one
	// control behind it.
	const askedFor = useMemo(
		() => declaredAttributes(attributeSpec ?? []),
		[attributeSpec],
	);

	function toggle(key: string) {
		setCollapsed((current) => {
			const next = new Set(current);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	}

	/** The one reading of a drag, from whichever event carries it. */
	function resolveFrom(
		event: DragMoveEvent | DragEndEvent,
	): ResolvedDrop | null {
		return resolveDrop({
			rows,
			shown,
			collapsed,
			activeKey: draggedKey(event),
			overKey: event.over ? String(event.over.id) : null,
			offsetX: event.delta.x,
			depthCeiling,
		});
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
	function handleInsert(shownSlot: number, depth: number) {
		const below = shown[shownSlot];
		const slot = below ? rows.indexOf(below) : rows.length;
		onInsert?.({
			slot,
			depth,
			commit: (reference) => insertReference(slot, depth, reference),
		});
	}

	function handleDragStart(event: DragStartEvent) {
		setActiveKey(draggedKey(event));
		setPending(null);
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
		setPending(resolveFrom(event));
	}

	function handleDragCancel() {
		setActiveKey(null);
		setPending(null);
	}

	function handleDragEnd(event: DragEndEvent) {
		setActiveKey(null);
		setPending(null);
		const resolved = resolveFrom(event);
		if (!resolved) return;

		const { activeIndex, overIndex, depth } = resolved;
		const moved = moveReferenceBranch({
			items: rows,
			activeIndex,
			overIndex,
			depth,
		});
		// A drag that ended where it started: leave the stored value alone
		// rather than rewriting it, which would dirty the form for nothing.
		const settled = moved.every(
			(row, index) =>
				row.key === rows[index].key && row.depth === rows[index].depth,
		);
		if (settled) return;

		const next = writeReferenceTree(value, nestReferences(moved));
		// `moved` and the rows the new value reads back as are both depth-first
		// over the same tree, so an index means the same row in either.
		const nextRows = readReferenceTree(next);
		const carried = carryCollapsed(moved, nextRows, collapsed);
		const landed = moved.findIndex((row) => row.key === draggedKey(event));
		// Unfold whatever the branch landed inside: a Reference has to be
		// visible where it was dropped.
		for (const key of ancestorKeys(nextRows, landed)) carried.delete(key);

		setCollapsed(carried);
		onChange(next);
	}

	// No strips without somewhere to put a Reference *between*: an empty tree
	// has no gaps, and the Field's Add control is its way in.
	const stripsOffered = !readOnly && onInsert !== undefined && shown.length > 0;

	/** The gap at `slot`: a strip, or the inert spacer a drag replaces it with. */
	function insertionGap(slot: number) {
		if (!stripsOffered) return null;
		if (activeKey !== null) return <ReferenceInsertSpacer />;
		return (
			<ReferenceInsertStrip
				rows={shown}
				slot={slot}
				names={names}
				indentWidth={INDENT_WIDTH}
				depthCeiling={depthCeiling}
				disabled={atItemCap ?? false}
				onInsert={handleInsert}
			/>
		);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragMove={handleDragUpdate}
			onDragOver={handleDragUpdate}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<SortableContext
				items={shown.map((row) => row.key)}
				strategy={verticalListSortingStrategy}
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
	} = useSortable({ id: row.key });
	const hasChildren = row.height > 0;

	return (
		<Flex
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			align="center"
			justify="space-between"
			gap="2"
			mb="2"
			ml={`${depth * INDENT_WIDTH}px`}
			px="3"
			py="2"
			bg="bg.muted"
			borderRadius="md"
			// An outline rather than a border: a marked row must not move, or
			// the feedback would restructure the very list it is describing.
			{...(adopted
				? { outline: "2px solid", outlineColor: "accent", outlineOffset: "1px" }
				: {})}
			opacity={isDragging ? 0.5 : 1}
			data-testid="reference-row"
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
