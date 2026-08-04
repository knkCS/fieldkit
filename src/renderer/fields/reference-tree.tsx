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
import { useMemo, useState } from "react";
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
	writeReferenceTree,
} from "../../schema/reference-tree";
import type { Field } from "../../schema/types";

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
	const { depth } = projectDropDepth({
		items: shown,
		activeIndex: shownActive,
		overIndex: shownOver === -1 ? shownActive : shownOver,
		offsetX,
		indentWidth: INDENT_WIDTH,
		depthCeiling,
	});
	return { activeIndex, overIndex, depth };
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
	 * The deepest depth a drop may land at, roots being 0.
	 *
	 * Nothing fills this in yet: the `max_depth` setting that will is #66's,
	 * along with every other cap. The seam is here because the projection
	 * needs somewhere to take a ceiling from, not because this control has an
	 * opinion about one.
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
}: ReferenceTreeProps) {
	// Seeded once, from the tree as it first arrived: a threshold is about
	// what opens on screen, so adding a Reference must not collapse the tree
	// an Author is working in.
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() =>
		initialCollapsed(rows),
	);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [projectedDepth, setProjectedDepth] = useState<number | null>(null);

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

	function handleDragStart(event: DragStartEvent) {
		setActiveKey(draggedKey(event));
		setProjectedDepth(null);
	}

	function handleDragMove(event: DragMoveEvent) {
		setProjectedDepth(resolveFrom(event)?.depth ?? null);
	}

	function handleDragCancel() {
		setActiveKey(null);
		setProjectedDepth(null);
	}

	function handleDragEnd(event: DragEndEvent) {
		setActiveKey(null);
		setProjectedDepth(null);
		const resolved = resolveFrom(event);
		if (!resolved) return;

		const moved = moveReferenceBranch({ items: rows, ...resolved });
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

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragMove={handleDragMove}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<SortableContext
				items={shown.map((row) => row.key)}
				strategy={verticalListSortingStrategy}
			>
				{shown.map((row) => (
					<ReferenceTreeRowItem
						key={row.key}
						row={row}
						name={names[row.reference.id] ?? row.reference.id}
						// The dragged row indents to where releasing would put it,
						// from the same resolution the release itself uses.
						depth={
							row.key === activeKey && projectedDepth !== null
								? projectedDepth
								: row.depth
						}
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
				))}
			</SortableContext>
		</DndContext>
	);
}
ReferenceTree.displayName = "ReferenceTree";

interface ReferenceTreeRowItemProps {
	row: ReferenceRow;
	name: string;
	/** What to draw at — the row's own depth, or where a drag would land it. */
	depth: number;
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
			opacity={isDragging ? 0.5 : 1}
			data-testid="reference-row"
			// The row's depth, for a test to read and for a Consumer to style
			// against without measuring pixels.
			data-depth={depth}
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
