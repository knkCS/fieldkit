// src/schema/reference-tree.ts
/**
 * The Reference Tree model: everything the tree Reference Field does to its
 * value that a DOM has no part in.
 *
 * The value is nested (ADR-0008) and stays nested; the flat, depth-indexed
 * list these functions produce is an implementation detail of the Field, not
 * of the value, and exists because tree drag-and-drop needs a list. So a drag
 * reads:
 *
 * ```
 * const items = flattenReferences(value);            // rows, top to bottom
 * const { depth } = projectDropDepth({ items, … });  // where a release lands
 * const moved = moveReferenceBranch({ items, … , depth });   // on release
 * const next = nestReferences(moved);                // back to a value
 * ```
 *
 * `referenceBranchEnd` is the rest of what a tree UI asks of the list: which
 * rows a Reference's branch occupies, which is what a drag moves and what a
 * collapsed Reference hides.
 *
 * `countReferences` is the same model's answer to "how big is this tree",
 * which is what `max_items` caps — every Reference at every level, since a
 * nested child is as real as a root.
 *
 * No DOM, no React, no dnd-kit: the drag maths is asserted with plain
 * assertions, following the precedent `resolve-drop-target.ts` set for the
 * editor canvas.
 */
import type { Reference } from "./reference";

/** A Reference with its branch removed — everything a flattened entry keeps. */
export type FlatReferenceValue = Omit<Reference, "children">;

/** One entry of a flattened Reference Tree. */
export interface FlatReference {
	/**
	 * The Reference itself, minus its branch: once flattened, nesting is the
	 * list's business and never the entry's.
	 */
	reference: FlatReferenceValue;
	/** 0 for a root Reference, 1 for its children, and so on. */
	depth: number;
	/**
	 * How many levels the Reference's own branch reaches below it — 0 for a
	 * leaf, 1 for a Reference with children but no grandchildren.
	 *
	 * It is measured here rather than counted at the drop because a drag
	 * takes the branch's rows out of the list, and the depth ceiling still
	 * has to know how far below the drop that branch would reach.
	 */
	height: number;
}

/**
 * What `nestReferences` needs of an entry: the Reference and the depth it
 * sits at. A `FlatReference` satisfies it, and so does a list a drag built
 * by hand — `height` is an output of flattening, never an input.
 */
export type NestableReference = Pick<FlatReference, "reference" | "depth">;

/**
 * Flattens a Reference Tree into a depth-indexed list, depth-first, so the
 * list reads top to bottom exactly as the tree renders.
 */
export function flattenReferences(
	references: readonly Reference[],
): FlatReference[] {
	const flat: FlatReference[] = [];
	/** Appends `node`'s branch and answers how tall that branch is. */
	const walk = (node: Reference, depth: number): number => {
		const { children, ...value } = node;
		const entry: FlatReference = { reference: value, depth, height: 0 };
		flat.push(entry);
		for (const child of children ?? []) {
			entry.height = Math.max(entry.height, walk(child, depth + 1) + 1);
		}
		return entry.height;
	};
	for (const node of references) walk(node, 0);
	return flat;
}

/**
 * Re-nests a depth-indexed list into a Reference Tree — the inverse of
 * `flattenReferences`, and the second half of every drag.
 *
 * Order and depth are the whole input, which is what lets a drop handler
 * reorder the list and re-depth one branch without maintaining anything
 * else. Every Reference is rebuilt, so the tree shares no branch with the
 * one it came from; an empty `children` is dropped, saying nothing a missing
 * one does not. What a Reference carries is carried across as it stands —
 * an Attribute record travels by identity, since its values are the
 * Consumer's and opaque to fieldkit (ADR-0008). A list that skips a level
 * (depth 0 followed by depth 2) attaches the deeper entry at the deepest
 * level actually available rather than throwing — the caller is a drop
 * handler, and an exception there would strand a half-applied drag.
 */
export function nestReferences(
	items: readonly NestableReference[],
): Reference[] {
	const roots: Reference[] = [];
	/** The ancestor chain: `open[d]` is the Reference open at depth `d`. */
	const open: Reference[] = [];
	for (const item of items) {
		const node: Reference = { ...item.reference };
		const depth = Math.max(0, Math.min(item.depth, open.length));
		if (depth === 0) {
			roots.push(node);
		} else {
			const parent = open[depth - 1];
			parent.children = [...(parent.children ?? []), node];
		}
		open.length = depth;
		open.push(node);
	}
	return roots;
}

/** What `projectDropDepth` is asked. */
export interface DepthProjectionInput {
	/**
	 * The flattened list, top to bottom, in whatever state the caller holds
	 * it: with the dragged Reference's own branch still in it, or with that
	 * branch pruned for the duration of the drag the way the sortable-tree
	 * pattern does. Either way the branch never counts as its own neighbour,
	 * and `height` keeps the ceiling honest when the branch has been pruned.
	 *
	 * `activeIndex` and `overIndex` index into this same list.
	 */
	items: readonly FlatReference[];
	/** Index in `items` of the Reference being dragged. */
	activeIndex: number;
	/** Index in `items` of the row the pointer is currently over. */
	overIndex: number;
	/** How far the pointer has travelled horizontally since the drag began. */
	offsetX: number;
	/** Pixels one level of indentation is drawn at — how `offsetX` reads. */
	indentWidth: number;
	/**
	 * The deepest depth a Reference may sit at, roots being 0 — so 0 forbids
	 * nesting altogether, and 1 allows roots with children but no
	 * grandchildren. Undefined for a Field that sets no ceiling, which leaves
	 * the neighbours the only bound.
	 *
	 * A Field's `max_depth` setting is what a caller passes here; whether
	 * that setting counts levels or names the deepest one is the setting's
	 * business to say, and its caller's to convert.
	 */
	depthCeiling?: number;
}

/** Where a drop would land, and the bounds that decided it. */
export interface DepthProjection {
	/** The depth the drop lands at: the pointer's ask, clamped to the bounds. */
	depth: number;
	/** The shallowest depth this slot allows, the ceiling already applied. */
	minDepth: number;
	/** The deepest depth this slot allows, the ceiling already applied. */
	maxDepth: number;
}

/**
 * The last index of the branch rooted at `index` — the rows below it that
 * sit deeper, which flattening guarantees are contiguous. Equal to `index`
 * itself for a leaf, for a caller that pruned the branch already, and for an
 * index the list does not reach.
 *
 * A branch is therefore always a slice, which is the whole reason the flat
 * list is worth having: a drag moves that slice, and a collapsed Reference
 * hides it. Depth is all it reads, so a list a caller built by hand answers
 * as readily as a flattened one.
 */
export function referenceBranchEnd(
	items: readonly Pick<FlatReference, "depth">[],
	index: number,
): number {
	const entry = items[index];
	if (!entry) return index;
	let end = index;
	while (end + 1 < items.length && items[end + 1].depth > entry.depth) end++;
	return end;
}

/**
 * Where a lifted branch lands: an index into the list *without* it.
 *
 * Below itself, the rows it vacated have already shifted up; at or above
 * itself — which includes hovering its own branch, an ask for nothing — it
 * lands where the pointer is. Shared by the projection and the move so the
 * two can never disagree about which slot they are talking about.
 */
function dropSlot(
	activeIndex: number,
	branchEnd: number,
	overIndex: number,
): number {
	return overIndex > branchEnd
		? overIndex - (branchEnd - activeIndex)
		: Math.min(overIndex, activeIndex);
}

/**
 * Projects the depth a dragged Reference would land at — the answer both the
 * drop handler and the live mid-drag indent read, so what an Author sees
 * while dragging is what releasing does. The precedent is the editor
 * canvas's `resolveDropTarget`, for the same reason: drag maths asserted
 * through a DOM is fragile, and one resolution has to serve both callers.
 *
 * The pointer's horizontal travel asks for a depth; the Reference above the
 * slot and the Reference below it decide how much of that ask is available.
 * One level deeper than the Reference above is the most nesting on offer
 * (anything more would skip a level); the Reference below sets the floor,
 * since landing shallower than it would silently adopt it and its branch.
 *
 * `depthCeiling` then caps all of it, minus the height of the branch being
 * dragged — the ceiling is a promise about the whole tree, so a Reference
 * with children of its own has to leave them room under it. Where that cap
 * and the floor disagree, the cap wins: a drop that adopts the Reference
 * below it is a shrug, and one that breaks the ceiling is a broken promise.
 */
export function projectDropDepth({
	items,
	activeIndex,
	overIndex,
	offsetX,
	indentWidth,
	depthCeiling,
}: DepthProjectionInput): DepthProjection {
	// An empty tree, or an index that no longer resolves: the only depth on
	// offer is a root, and a drag has nothing to read the pointer against.
	const active = items[activeIndex];
	if (!active) return { depth: 0, minDepth: 0, maxDepth: 0 };

	// The list the drop would leave behind: the whole branch travels, so
	// none of it can be a neighbour of the slot it is looking for — not even
	// when the caller is still rendering it.
	const end = referenceBranchEnd(items, activeIndex);
	const rest = [...items.slice(0, activeIndex), ...items.slice(end + 1)];
	const slot = dropSlot(activeIndex, end, overIndex);
	const above = rest[slot - 1];
	const below = rest[slot];

	const levels = indentWidth > 0 ? Math.round(offsetX / indentWidth) : 0;
	const asked = active.depth + levels;

	// A branch too tall for the ceiling has nowhere legal to go; a root is
	// the least illegal, and the Schema reports the rest.
	const capped =
		depthCeiling === undefined
			? Number.POSITIVE_INFINITY
			: Math.max(0, depthCeiling - active.height);
	const maxDepth = Math.min(above ? above.depth + 1 : 0, capped);
	const minDepth = Math.min(below ? below.depth : 0, maxDepth);

	return {
		depth: Math.min(Math.max(asked, minDepth), maxDepth),
		minDepth,
		maxDepth,
	};
}

/** What `moveReferenceBranch` is asked. */
export interface BranchMoveInput<T extends NestableReference> {
	/**
	 * The flattened list, in the same state `projectDropDepth` was given it —
	 * and carrying whatever else the caller needs back, which is what the
	 * generic is for.
	 */
	items: readonly T[];
	/** Index in `items` of the Reference being dragged. */
	activeIndex: number;
	/** Index in `items` of the row the drop landed on. */
	overIndex: number;
	/** The depth the dragged Reference lands at — `projectDropDepth`'s answer. */
	depth: number;
}

/**
 * Moves a dragged Reference and everything under it to where the drop landed,
 * re-depthing that branch by the difference — the second half of every drag,
 * and the half `projectDropDepth` deliberately leaves out. Hand the answer to
 * `nestReferences` and the drag is done.
 *
 * The branch travels as one slice, so a Reference's descendants keep their
 * shape and their order under it however far it moves: only depths change,
 * and all of them by the same amount. Reordering among siblings is the same
 * operation with a shift of zero, so a drop never has to decide which kind of
 * move it was.
 *
 * Generic in the entry because a caller usually carries more than the model
 * needs — a row key, a rendering flag — and getting that back in the new
 * order is what lets it follow the move without redoing this arithmetic.
 * Every field is carried across untouched except `depth`; anything the caller
 * derived from the tree's *shape* is stale in the result, `height` above all,
 * and is re-read by flattening the tree this list nests into.
 */
export function moveReferenceBranch<T extends NestableReference>({
	items,
	activeIndex,
	overIndex,
	depth,
}: BranchMoveInput<T>): T[] {
	// An index that no longer resolves: hand the list back as it stands
	// rather than reordering around a Reference that isn't there.
	const active = items[activeIndex];
	if (!active) return [...items];

	const end = referenceBranchEnd(items, activeIndex);
	const shift = depth - active.depth;
	const branch = items
		.slice(activeIndex, end + 1)
		.map((item): T => ({ ...item, depth: item.depth + shift }));
	const rest = [...items.slice(0, activeIndex), ...items.slice(end + 1)];
	const slot = Math.max(
		0,
		Math.min(dropSlot(activeIndex, end, overIndex), rest.length),
	);
	return [...rest.slice(0, slot), ...branch, ...rest.slice(slot)];
}

/**
 * Counts the References in a tree — every one of them, at every level, which
 * is what `max_items` caps. A nested child costs the same as a root.
 *
 * It counts the flattened list rather than walking the tree again, so the
 * cap and the rows can never disagree about how big a tree is.
 */
export function countReferences(references: readonly Reference[]): number {
	return flattenReferences(references).length;
}
