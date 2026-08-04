import { Box, Flex, IconButton, Text } from "@chakra-ui/react";
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
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Reference } from "../../schema/reference";
import { asReference } from "../../schema/reference";
import type { FlatReference } from "../../schema/reference-tree";
import {
	flattenReferences,
	moveReferenceBranch,
	nestReferences,
	projectDropDepth,
	referenceBranchEnd,
} from "../../schema/reference-tree";

/** Pixels of indentation one level of nesting is drawn at. */
const INDENT_WIDTH = 24;

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

/** One rendered row: a flattened Reference, and where it came from. */
export interface ReferenceTreeRow extends FlatReference {
	/**
	 * Index path into the *stored* value — `[1, 0]` is
	 * `value[1].children[0]`.
	 *
	 * Kept because form data is only as well-formed as whatever produced it:
	 * an entry that is not a Reference renders no row, so a row's place among
	 * the rows is not its place in the array a remove has to splice.
	 */
	path: number[];
	/** `path` as a string — the row's drag id, its React key, its collapse key. */
	key: string;
}

/** What {@link readReferenceTree} makes of a stored value. */
export interface StoredReferenceTree {
	/** The value read as a tree, with anything that is not a Reference dropped. */
	tree: Reference[];
	/** That tree flattened: one entry per row, top to bottom. */
	rows: ReferenceTreeRow[];
}

/**
 * Reads a stored value as a Reference Tree, remembering where each Reference
 * came from.
 *
 * The walk is depth-first and records a path before descending, so the paths
 * it collects line up one for one with what `flattenReferences` produces from
 * the same tree.
 */
export function readReferenceTree(value: unknown): StoredReferenceTree {
	const paths: number[][] = [];
	const walk = (entries: unknown, prefix: readonly number[]): Reference[] => {
		if (!Array.isArray(entries)) return [];
		const kept: Reference[] = [];
		entries.forEach((entry, index) => {
			const reference = asReference(entry);
			if (!reference) return;
			const path = [...prefix, index];
			paths.push(path);
			const { children: _ignored, ...rest } = reference;
			const children = walk(reference.children, path);
			kept.push(children.length > 0 ? { ...rest, children } : rest);
		});
		return kept;
	};
	const tree = walk(value, []);
	const rows = flattenReferences(tree).map((entry, index) => ({
		...entry,
		path: paths[index],
		key: paths[index].join("."),
	}));
	return { tree, rows };
}

/**
 * The stored value with the Reference at `path` taken out of it — its branch
 * with it, since removing a Reference removes what hangs off it.
 *
 * Everything else is left exactly as it was, including entries that were
 * never References: they render no row, so nothing an Author did asked for
 * them to go.
 */
function removeAtPath(value: unknown, path: readonly number[]): unknown[] {
	const entries: unknown[] = Array.isArray(value) ? value : [];
	const [index, ...rest] = path;
	if (rest.length === 0) return entries.filter((_, i) => i !== index);
	return entries.map((entry, i) => {
		if (i !== index) return entry;
		const reference = entry as Reference;
		const children = removeAtPath(reference.children, rest) as Reference[];
		if (children.length > 0) return { ...reference, children };
		const { children: _emptied, ...withoutBranch } = reference;
		return withoutBranch;
	});
}

/** The rows an Author can see: everything not inside a collapsed Reference. */
function visibleRows(
	rows: readonly ReferenceTreeRow[],
	collapsed: ReadonlySet<string>,
): ReferenceTreeRow[] {
	const shown: ReferenceTreeRow[] = [];
	let hiddenThrough = -1;
	rows.forEach((row, index) => {
		if (index <= hiddenThrough) return;
		shown.push(row);
		if (row.height > 0 && collapsed.has(row.key)) {
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
function initialCollapsed(rows: readonly ReferenceTreeRow[]): Set<string> {
	if (rows.length <= REFERENCE_TREE_COLLAPSE_THRESHOLD) return new Set();
	return new Set(rows.filter((row) => row.height > 0).map((row) => row.key));
}

/** Where a drag would land, in the terms the model works in. */
interface ResolvedDrop {
	activeIndex: number;
	overIndex: number;
	depth: number;
}

/**
 * Resolves a drag against the flat list — the one answer both the live indent
 * and the release read, so what an Author watches is what letting go does.
 * The precedent is the editor canvas's `resolveDropTarget`.
 */
function resolveDrop(
	rows: readonly ReferenceTreeRow[],
	collapsed: ReadonlySet<string>,
	activeId: string,
	overId: string | null,
	offsetX: number,
	depthCeiling: number | undefined,
): ResolvedDrop | null {
	const activeIndex = rows.findIndex((row) => row.key === activeId);
	if (activeIndex === -1) return null;

	const over = rows.findIndex((row) => row.key === overId);
	// Over nothing that resolves is a drag hovering its own row: no move, but
	// still a depth the pointer may have asked for.
	let overIndex = over === -1 ? activeIndex : over;
	// A collapsed Reference stands in for everything it hides. Dropping below
	// it means below its whole branch, never silently inside a branch nobody
	// can see.
	if (overIndex > activeIndex && collapsed.has(rows[overIndex].key)) {
		overIndex = referenceBranchEnd(rows, overIndex);
	}

	const { depth } = projectDropDepth({
		items: rows,
		activeIndex,
		overIndex,
		offsetX,
		indentWidth: INDENT_WIDTH,
		depthCeiling,
	});
	return { activeIndex, overIndex, depth };
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
	/** The rows to render — {@link readReferenceTree} of the stored value. */
	rows: readonly ReferenceTreeRow[];
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
 *   with it, at the depths they held relative to it — collapsed or not.
 * - **A drop rewrites the value.** A remove splices the one Reference out by
 *   its stored path and leaves everything else untouched; a drop re-nests the
 *   whole tree, so entries that were never Reference-shaped — which render no
 *   row — do not survive one.
 */
export function ReferenceTree({
	rows,
	value,
	names,
	readOnly,
	onChange,
	depthCeiling,
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

	function toggle(key: string) {
		setCollapsed((current) => {
			const next = new Set(current);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	}

	function handleRemove(row: ReferenceTreeRow) {
		// The branch goes with it, so the rows left behind are the ones either
		// side of that slice — which is what the collapsed set has to follow.
		const from = rows.indexOf(row);
		const end = referenceBranchEnd(rows, from);
		const kept = rows.filter((_, index) => index < from || index > end);
		const next = removeAtPath(value, row.path);
		setCollapsed(carryCollapsed(kept, readReferenceTree(next).rows, collapsed));
		onChange(next);
	}

	function handleDragStart(event: DragStartEvent) {
		setActiveKey(String(event.active.id));
		setProjectedDepth(null);
	}

	function handleDragMove(event: DragMoveEvent) {
		const resolved = resolveDrop(
			rows,
			collapsed,
			String(event.active.id),
			event.over ? String(event.over.id) : null,
			event.delta.x,
			depthCeiling,
		);
		setProjectedDepth(resolved?.depth ?? null);
	}

	function handleDragCancel() {
		setActiveKey(null);
		setProjectedDepth(null);
	}

	function handleDragEnd(event: DragEndEvent) {
		setActiveKey(null);
		setProjectedDepth(null);
		const resolved = resolveDrop(
			rows,
			collapsed,
			String(event.active.id),
			event.over ? String(event.over.id) : null,
			event.delta.x,
			depthCeiling,
		);
		if (!resolved) return;

		const moved = moveReferenceBranch({ items: rows, ...resolved });
		// A drag that ended where it started: leave the stored value alone
		// rather than rewriting it — a rewrite would dirty the form and
		// normalise away entries nobody asked to lose.
		const settled = moved.every(
			(row, index) =>
				row.key === rows[index].key && row.depth === rows[index].depth,
		);
		if (settled) return;

		const next = nestReferences(moved);
		setCollapsed(
			carryCollapsed(moved, readReferenceTree(next).rows, collapsed),
		);
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
						onToggle={() => toggle(row.key)}
						onRemove={() => handleRemove(row)}
					/>
				))}
			</SortableContext>
		</DndContext>
	);
}
ReferenceTree.displayName = "ReferenceTree";

interface ReferenceTreeRowItemProps {
	row: ReferenceTreeRow;
	name: string;
	/** What to draw at — the row's own depth, or where a drag would land it. */
	depth: number;
	collapsed: boolean;
	readOnly: boolean;
	onToggle: () => void;
	onRemove: () => void;
}

function ReferenceTreeRowItem({
	row,
	name,
	depth,
	collapsed,
	readOnly,
	onToggle,
	onRemove,
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
				<Text fontSize="sm">{name}</Text>
			</Flex>
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
	);
}
ReferenceTreeRowItem.displayName = "ReferenceTreeRowItem";
