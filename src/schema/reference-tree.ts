// src/schema/reference-tree.ts
/**
 * The Reference Tree model: everything the tree Reference Field does to its
 * value that a DOM has no part in.
 *
 * The value is nested (ADR-0008) and stays nested; the flat, depth-indexed
 * list these functions produce is an implementation detail of the Field, not
 * of the value, and exists because placing a Reference in a tree — by drag or
 * by insertion — is an operation on rows. So a drag reads:
 *
 * ```
 * const items = flattenReferences(value);            // rows, top to bottom
 * const { depth } = projectDropDepth({ items, … });  // where a release lands
 * const moved = moveReferenceBranch({ items, … , depth });   // on release
 * const next = nestReferences(moved);                // back to a value
 * ```
 *
 * An insert reads the same way, through the two functions that are its half of
 * the pair:
 *
 * ```
 * const { depth, adopted } = projectInsertDepth({ items, slot, … });
 * const spliced = spliceReference({ items, reference, slot, depth });
 * const next = nestReferences(spliced);
 * ```
 *
 * Both projections answer with the rows a placement would **adopt** — the ones
 * that follow a Reference arriving shallower than they are, and so become its
 * children (ADR-0012). Adoption is not an operation either function performs:
 * it falls out of re-nesting a list by order and depth alone. What the model
 * owes is that the arithmetic around it is honest, which is why the rows that
 * would move come back from the projection rather than being re-derived by
 * every affordance that has to announce them.
 *
 * `referenceBranchEnd` is the rest of what a tree UI asks of the list: which
 * rows a Reference's branch occupies, which is what a drag moves and what a
 * folded Reference hides.
 *
 * Folding reads it. Which rows a fold set hides, which folds stand above a
 * row, which of those a Reveal must open, and the set a tree opens with — all
 * of them arithmetic over the same list, and all of them here rather than in
 * the control that folds today, because a second renderer of this tree is to
 * share these rules rather than grow a copy of them (#88, #153).
 *
 * `countReferences` is the same model's answer to "how big is this tree",
 * which is what `max_items` caps — every Reference at every level, since a
 * nested child is as real as a root. `referencesPastDepth` is its answer to
 * "how deep", which is what `max_depth` caps, and it answers with *where* so
 * the Schema can report at the Reference that broke the cap.
 *
 * One step further out sit `readReferenceTree`, `writeReferenceTree` and
 * `removeReferenceAt`, which deal with a *stored value* rather than a tree.
 * Form data arrives from a Consumer and is only as well-formed as whatever
 * produced it, so reading it is a job of its own: the reader drops what is
 * not a Reference and remembers where the rest came from, and the writer
 * puts the strays back. Everything above them can then assume a real tree.
 *
 * No DOM, no React, no dnd-kit: the drag, insert and fold maths are asserted
 * with plain assertions, following the precedent `resolve-drop-target.ts` set
 * for the editor canvas.
 */
import type { Reference } from "./reference";
import { asReference } from "./reference";

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
export interface DepthProjectionInput<T extends FlatReference = FlatReference> {
	/**
	 * The flattened list, top to bottom, in whatever state the caller holds
	 * it: with the dragged Reference's own branch still in it, or with that
	 * branch pruned for the duration of the drag the way the sortable-tree
	 * pattern does. Either way the branch never counts as its own neighbour,
	 * and `height` keeps the ceiling honest when the branch has been pruned.
	 *
	 * `activeIndex` and `overIndex` index into this same list.
	 */
	items: readonly T[];
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

/**
 * Where a placement would land, the bounds that decided it, and what it would
 * take with it — the one answer a drop and an insert both read.
 */
export interface DepthProjection<T extends FlatReference = FlatReference> {
	/** The depth it lands at: the pointer's ask, clamped to the bounds. */
	depth: number;
	/** The shallowest depth this slot allows, the ceiling already applied. */
	minDepth: number;
	/** The deepest depth this slot allows, the ceiling already applied. */
	maxDepth: number;
	/**
	 * The rows that would become the placed Reference's descendants — every
	 * one that moves, so a branch's rows are all here and not only its root.
	 * Empty when the placement adopts nothing, which is the ordinary case.
	 *
	 * They come back from the projection because both affordances have to
	 * *announce* adoption before it happens (ADR-0012): the insertion strip
	 * names the rows in its label, the drag marks them mid-drag. Leaving each
	 * caller to re-derive them from `depth` would be the same rule written
	 * twice, and a label that disagreed with the release is the defect this
	 * behaviour was modelled on.
	 *
	 * Entries are the caller's own, in the order they hold them, so a row's
	 * key or name travels back with it.
	 */
	adopted: T[];
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
 * The rows a Reference arriving at `depth` in the slot at `slot` would take as
 * its own — Adoption, read off the list rather than performed on it.
 *
 * They are the run of rows following the slot that sit deeper than the
 * arrival: order and depth are the whole of what `nestReferences` reads, so a
 * row deeper than the entry above it *is* that entry's child, whether or not
 * anyone asked. The run is contiguous, because flattening guarantees a branch
 * is a slice, and it stops at the first row shallow enough to close it.
 *
 * Empty for a placement at or below the depth of the row beneath it, which is
 * every placement that adopts nothing.
 */
function adoptedRows<T extends Pick<FlatReference, "depth">>(
	items: readonly T[],
	slot: number,
	depth: number,
): T[] {
	let end = slot;
	while (end < items.length && items[end].depth > depth) end++;
	return items.slice(slot, end);
}

/** What {@link adoptionFloor} is asked. */
interface AdoptionFloorInput<T extends Pick<FlatReference, "depth">> {
	/** The rows the placement will land among — the dragged branch already out
	 * of them, so nothing it is taking with it counts as a neighbour. */
	items: readonly T[];
	/** Where the Reference arrives, as an index into `items`. */
	slot: number;
	/**
	 * Whether this placement may adopt at all. An insert always may. A drag
	 * may only when the Reference it carries is a leaf: one bringing a branch
	 * cannot take a second one as well, so it keeps the floor at the row
	 * below's own depth, where nothing follows it deeper.
	 */
	adopting: boolean;
	/** The deepest depth any Reference may sit at, roots being 0. */
	depthCeiling?: number;
}

/**
 * The shallowest depth the row below a slot leaves for a Reference arriving in
 * it — the floor, and the one bound ADR-0012 moved.
 *
 * Where adoption is on offer the floor is one level shallower than the row
 * below, and *exactly* one — so adopting is reachable at a single depth, and
 * the branch it would take is known without asking which depth the pointer
 * chose. `depthCeiling` is then spent on that branch as well as on the one
 * being placed: adopting hangs those rows under the arrival, and a level that
 * would leave the deepest of them past the ceiling is not offered at all —
 * the ceiling less the adopted branch's height, since the run's shallowest row
 * is the level below the arrival and its deepest is that height further down.
 *
 * The reach is read off the adopted rows' own depths rather than off the
 * `height` cached on them, and the difference matters twice. A `height` is
 * measured over the *whole* tree, so a row about to lose the very branch that
 * gave it its height — the dragged Reference's own ancestor — would be read as
 * taller than it is about to be. And the run already holds every descendant
 * still in the list, because it stops only at a row shallow enough to close
 * it, so the deepest row in the run *is* the reach.
 *
 * Note what this can and cannot do. Splicing a Reference in and re-nesting
 * never deepens a row that was already there — `nestReferences` clamps a
 * skipped level *down*, and an adopted row was already deeper than the arrival
 * — so on a tree within its ceiling this never binds. What it guards is a tree
 * that is *already* too deep, where an offered adoption would move rows the
 * Schema is about to complain about, and a placement should not go rearranging
 * a branch it cannot make legal.
 */
function adoptionFloor<T extends Pick<FlatReference, "depth">>({
	items,
	slot,
	adopting,
	depthCeiling,
}: AdoptionFloorInput<T>): number {
	const below = items[slot];
	// Nothing below the slot: nothing to land shallower than, and nothing to
	// adopt. A root is as shallow as depths go.
	if (!below) return 0;
	const floor = below.depth - 1;
	if (!adopting || floor < 0) return below.depth;
	if (depthCeiling === undefined) return floor;
	const reach = adoptedRows(items, slot, floor).reduce(
		(deepest, row) => Math.max(deepest, row.depth),
		floor,
	);
	return reach > depthCeiling ? below.depth : floor;
}

/**
 * Projects the depth a dragged Reference would land at, and the rows landing
 * there would adopt — the answer both the drop handler and the live mid-drag
 * feedback read, so what an Author sees while dragging is what releasing does.
 * The precedent is the editor canvas's `resolveDropTarget`, for the same
 * reason: drag maths asserted through a DOM is fragile, and one resolution has
 * to serve both callers.
 *
 * The pointer's horizontal travel asks for a depth; the Reference above the
 * slot and the Reference below it decide how much of that ask is available.
 * One level deeper than the Reference above is the most nesting on offer
 * (anything more would skip a level). The Reference below sets the floor at
 * **one level shallower than itself** when the dragged Reference is a leaf:
 * landing there makes it and its branch the arrival's children, which is
 * Adoption, and ADR-0012 makes it deliberate rather than an accident to be
 * forbidden. A Reference carrying children of its own keeps the older floor —
 * the row below's own depth — because it cannot take a branch while bringing
 * one.
 *
 * `depthCeiling` then caps all of it, minus the height of the branch being
 * dragged — the ceiling is a promise about the whole tree, so a Reference with
 * children of its own has to leave them room under it — and minus the height
 * of the branch that would be adopted, which is what withdraws the adopting
 * level. Where the cap and the floor disagree the cap still wins: a drop that
 * breaks the ceiling is a broken promise, and the ceiling squeezing a drop
 * shallower than the row below is an adoption like any other, reported in
 * `adopted` rather than allowed to happen unannounced.
 */
export function projectDropDepth<T extends FlatReference = FlatReference>({
	items,
	activeIndex,
	overIndex,
	offsetX,
	indentWidth,
	depthCeiling,
}: DepthProjectionInput<T>): DepthProjection<T> {
	// An empty tree, or an index that no longer resolves: the only depth on
	// offer is a root, and a drag has nothing to read the pointer against.
	const active = items[activeIndex];
	if (!active) return { depth: 0, minDepth: 0, maxDepth: 0, adopted: [] };

	// The list the drop would leave behind: the whole branch travels, so
	// none of it can be a neighbour of the slot it is looking for — not even
	// when the caller is still rendering it.
	const end = referenceBranchEnd(items, activeIndex);
	const rest = [...items.slice(0, activeIndex), ...items.slice(end + 1)];
	const slot = dropSlot(activeIndex, end, overIndex);
	const above = rest[slot - 1];

	const levels = indentWidth > 0 ? Math.round(offsetX / indentWidth) : 0;
	const asked = active.depth + levels;

	// A branch too tall for the ceiling has nowhere legal to go; a root is
	// the least illegal, and the Schema reports the rest.
	const capped =
		depthCeiling === undefined
			? Number.POSITIVE_INFINITY
			: Math.max(0, depthCeiling - active.height);
	const maxDepth = Math.min(above ? above.depth + 1 : 0, capped);
	const minDepth = Math.min(
		adoptionFloor({
			items: rest,
			slot,
			// Only a leaf may adopt: a Reference that carries a branch cannot
			// take a second one as well.
			adopting: active.height === 0,
			depthCeiling,
		}),
		maxDepth,
	);

	const depth = Math.min(Math.max(asked, minDepth), maxDepth);
	return { depth, minDepth, maxDepth, adopted: adoptedRows(rest, slot, depth) };
}

/** What {@link referenceDropTarget} is asked — a drag, minus the pointer. */
export interface DropTargetInput<T extends FlatReference = FlatReference> {
	/** The flattened list, in the same state `projectDropDepth` was given it. */
	items: readonly T[];
	/** Index in `items` of the Reference being dragged. */
	activeIndex: number;
	/** Index in `items` of the row the pointer is currently over. */
	overIndex: number;
}

/**
 * The row a dragged branch would land immediately before, or `null` when it
 * would land after the last one — the *position* half of a drop, where
 * `projectDropDepth` answers the *depth* half.
 *
 * It exists so that feedback drawn in a gap and the move performed on release
 * cannot disagree about which gap: both read `dropSlot`, the same rule
 * `moveReferenceBranch` splices at. A caller re-deriving "which gap" from an
 * over-index would be that rule written twice, and the branch skip is exactly
 * the part such a rewrite gets wrong — a Reference hovering its own descendant
 * is asking for nothing, and the row after its whole branch is what follows it.
 *
 * Answering with the row rather than an index is deliberate: a caller rendering
 * gaps holds a list that still contains the dragged branch, so the index into
 * the list *without* it would need translating back. A row identifies its gap
 * whichever list the caller is walking.
 */
export function referenceDropTarget<T extends FlatReference = FlatReference>({
	items,
	activeIndex,
	overIndex,
}: DropTargetInput<T>): T | null {
	if (!items[activeIndex]) return null;
	const end = referenceBranchEnd(items, activeIndex);
	const rest = [...items.slice(0, activeIndex), ...items.slice(end + 1)];
	return rest[dropSlot(activeIndex, end, overIndex)] ?? null;
}

/** What `projectInsertDepth` is asked. */
export interface InsertProjectionInput<
	T extends FlatReference = FlatReference,
> {
	/**
	 * The flattened list the Reference would be inserted into, top to bottom —
	 * the rows on screen, since a slot an Author cannot see is not one they
	 * pointed at.
	 */
	items: readonly T[];
	/**
	 * Where in `items` the Reference would go: the index it would take, so `0`
	 * is before the first row and `items.length` is after the last. Every
	 * position is expressible, unlike core's strip, which sits only *after* a
	 * row and so cannot reach the top of the tree.
	 */
	slot: number;
	/**
	 * How far into the row the pointer sits, measured from the tree's left
	 * edge — where a drag's `offsetX` is travel *since it began*, an insert
	 * has no depth to travel from, so this names a level outright.
	 */
	offsetX: number;
	/** Pixels one level of indentation is drawn at — how `offsetX` reads. */
	indentWidth: number;
	/**
	 * The deepest depth a Reference may sit at, roots being 0. Undefined for a
	 * Field that sets no ceiling, which leaves the neighbours the only bound —
	 * the same dialect `projectDropDepth` takes, converted from a `max_depth`
	 * setting by `referenceDepthCeiling`.
	 */
	depthCeiling?: number;
}

/**
 * Projects the depth a Reference would be inserted at, and the rows the insert
 * would adopt — everything an insertion affordance needs to say what a click
 * will do before it happens.
 *
 * The rows either side of the slot decide it, exactly as they do for a drop:
 * one level deeper than the row above is the most nesting on offer, and the
 * row below sets the floor one level shallower than itself, which is the level
 * that takes it and its branch as children. `depthCeiling` caps both, and is
 * spent on the adopted branch as well.
 *
 * It is a separate function from `projectDropDepth` rather than a mode of it
 * because the two are asked different questions — a drag is *somewhere* and
 * asks how far it has moved, an insert is nowhere and asks for a level — and
 * they answer in the same shape so that a strip and a drag describe their
 * outcomes with one vocabulary. The Reference being inserted is always a leaf:
 * a Content is picked one at a time, and a branch on it would be nested twice.
 */
export function projectInsertDepth<T extends FlatReference = FlatReference>({
	items,
	slot,
	offsetX,
	indentWidth,
	depthCeiling,
}: InsertProjectionInput<T>): DepthProjection<T> {
	const at = Math.max(0, Math.min(slot, items.length));
	const above = items[at - 1];

	// Whole levels from the left edge: the pointer is *in* a column rather
	// than partway to the next one, so the first pixel of a level is already
	// that level.
	const asked = indentWidth > 0 ? Math.floor(offsetX / indentWidth) : 0;

	const capped = depthCeiling ?? Number.POSITIVE_INFINITY;
	const maxDepth = Math.max(0, Math.min(above ? above.depth + 1 : 0, capped));
	const minDepth = Math.min(
		// A Content is picked one at a time and arrives without a branch, so an
		// insert may always adopt.
		adoptionFloor({ items, slot: at, adopting: true, depthCeiling }),
		maxDepth,
	);

	const depth = Math.min(Math.max(asked, minDepth), maxDepth);
	return { depth, minDepth, maxDepth, adopted: adoptedRows(items, at, depth) };
}

/** What `spliceReference` is asked. */
export interface ReferenceSpliceInput {
	/** The flattened list to insert into, top to bottom. */
	items: readonly NestableReference[];
	/**
	 * The Reference to insert. Its own `children` are dropped: depth and order
	 * are the whole of what re-nesting reads, so a branch travelling in on the
	 * value would be nested a second time.
	 */
	reference: Reference;
	/** Where it goes — the index it takes, `projectInsertDepth`'s `slot`. */
	slot: number;
	/** The depth it lands at — `projectInsertDepth`'s answer. */
	depth: number;
}

/**
 * Splices one Reference into a flattened tree at a position and a depth. Hand
 * the answer to `nestReferences` and the insert is done.
 *
 * It moves nothing and rewrites nothing: the rows either side keep the depths
 * they had, and Adoption happens — or does not — purely because re-nesting
 * reads a list by order and depth. Inserting a root between a Reference and
 * its children takes those children, because there is no other tree that list
 * describes; inserting at their own depth leaves them where they are. Both
 * outcomes fall out of the same two lines, which is why adoption needs no
 * ancestor surgery here (ADR-0012) and why the round trip through
 * `flattenReferences` is lossless across it.
 *
 * Unlike `moveReferenceBranch` it is not generic in the entry: the Reference
 * arriving has no counterpart in whatever the caller hangs on its own rows, so
 * a generic result would be a union nobody could read. A caller that needs its
 * own rows back reads them off the value it writes.
 */
export function spliceReference({
	items,
	reference,
	slot,
	depth,
}: ReferenceSpliceInput): NestableReference[] {
	const { children: _branch, ...value } = reference;
	const at = Math.max(0, Math.min(slot, items.length));
	const entry: NestableReference = {
		reference: value,
		depth: Math.max(0, depth),
	};
	return [...items.slice(0, at), entry, ...items.slice(at)];
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

/** One flattened Reference, and where in the stored value it came from. */
export interface ReferenceRow extends FlatReference {
	/**
	 * Index path into the stored value — `[1, 0]` is `value[1].children[0]`.
	 *
	 * Worth keeping because a stored value may hold entries that are not
	 * References at all: they yield no row, so a row's place among the rows is
	 * not its place in the array a targeted edit has to splice.
	 */
	path: number[];
	/**
	 * `path` as a string: a name for the row that is stable for as long as the
	 * value is, which is what a caller keying rows — for React, for a drag
	 * library, for a set of folded branches — needs and a Reference cannot
	 * give. The same Content may legitimately be referenced twice, so an id is
	 * not an identity here.
	 */
	key: string;
}

/**
 * A row's index path as the dotted name the stored value takes in a form —
 * `[1, 0]` reads `1.children.0`, so under a Field's Accessor it addresses
 * exactly the entry the path came from.
 *
 * It lives with `path` rather than in the control that uses it because it is
 * the same fact: where in the *value* a row sits. A form path is only that
 * fact spelled the way React Hook Form asks for it, and getting the two out of
 * step would write one Reference's Attributes onto another.
 */
export function referenceRowPath(path: readonly number[]): string {
	return path
		.map((index, level) =>
			level === 0 ? String(index) : `children.${String(index)}`,
		)
		.join(".");
}

/**
 * Reads a stored value as a Reference Tree's rows, top to bottom, dropping
 * anything that is not a Reference at any level.
 *
 * The one place that turns a Consumer's data into something the rest of this
 * model may assume is well-formed. Nothing is repaired and nothing throws:
 * an entry that is not a Reference simply yields no row, and `path` is what
 * lets a caller still find it in the array it came from.
 */
export function readReferenceTree(value: unknown): ReferenceRow[] {
	const paths: number[][] = [];
	const walk = (entries: unknown, prefix: readonly number[]): Reference[] => {
		if (!Array.isArray(entries)) return [];
		const kept: Reference[] = [];
		entries.forEach((entry, index) => {
			const reference = asReference(entry);
			if (!reference) return;
			const path = [...prefix, index];
			// Recorded before descending, so `paths` comes out in the same
			// depth-first order `flattenReferences` produces below.
			paths.push(path);
			const { children: _branch, ...rest } = reference;
			const children = walk(reference.children, path);
			kept.push(children.length > 0 ? { ...rest, children } : rest);
		});
		return kept;
	};
	return flattenReferences(walk(value, [])).map((entry, index) => ({
		...entry,
		path: paths[index],
		key: paths[index].join("."),
	}));
}

/**
 * Writes a tree back over the value it was read from, keeping the entries
 * that were never References at the positions they held.
 *
 * Only top-level strays survive, and that is a fact about the value rather
 * than a compromise: the stored value is an array of roots and stays one, so
 * a root's neighbours keep their indices — while every branch below is rebuilt
 * from depths, leaving a stray nested inside one nowhere to be put back. A
 * value with a stray in a branch cannot pass the Field's Schema anyway.
 */
export function writeReferenceTree(
	value: unknown,
	roots: readonly Reference[],
): unknown[] {
	const entries: unknown[] = Array.isArray(value) ? value : [];
	const next: unknown[] = [...roots];
	entries.forEach((entry, index) => {
		if (asReference(entry) === null) {
			next.splice(Math.min(index, next.length), 0, entry);
		}
	});
	return next;
}

/**
 * The stored value with the Reference at `path` taken out of it, and its
 * branch with it — removing a Reference removes what hangs off it.
 *
 * Everything else is left exactly as it stands, strays included: a removal is
 * a targeted edit, and nothing an Author did asked for the rest to change.
 */
export function removeReferenceAt(
	value: unknown,
	path: readonly number[],
): unknown[] {
	const entries: unknown[] = Array.isArray(value) ? value : [];
	const [index, ...rest] = path;
	if (rest.length === 0) return entries.filter((_, i) => i !== index);
	return entries.map((entry, i) => {
		if (i !== index) return entry;
		const reference = entry as Reference;
		const children = removeReferenceAt(reference.children, rest) as Reference[];
		if (children.length > 0) return { ...reference, children };
		const { children: _emptied, ...withoutBranch } = reference;
		return withoutBranch;
	});
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

/**
 * Where a tree breaks a depth ceiling — the same model's answer to "how deep
 * is this tree", which is what `max_depth` caps.
 *
 * Each answer is a key path into the *stored value*, spelled the way a Zod
 * issue path is: `[0, "children", 1]` addresses `value[0].children[1]`. That is
 * so a caller can hand it straight to `ctx.addIssue` and have the Schema report
 * at the offending Reference rather than at the Field, which is the difference
 * between "this tree is too deep somewhere" and "this Reference is the one".
 *
 * Only the *shallowest* offender in each branch is reported. Everything under a
 * Reference that is already too deep is too deep because of it, so one error
 * per branch says everything a per-descendant flood would, and an Author fixing
 * the named Reference fixes them all at once.
 *
 * `ceiling` is a depth index, roots being 0 — the same dialect
 * `projectDropDepth` takes, so the Schema and the drag clamp cannot disagree.
 * Converting a Field's `max_depth` setting into one is that setting's business;
 * `referenceDepthCeiling` is where it happens.
 */
export function referencesPastDepth(
	references: readonly Reference[],
	ceiling: number,
): (string | number)[][] {
	const found: (string | number)[][] = [];
	const walk = (
		nodes: readonly Reference[],
		depth: number,
		prefix: readonly (string | number)[],
	): void => {
		nodes.forEach((node, index) => {
			const path = [...prefix, index];
			if (depth > ceiling) {
				found.push(path);
				return;
			}
			walk(node.children ?? [], depth + 1, [...path, "children"]);
		});
	};
	walk(references, 0, []);
	return found;
}

/*
 * Folding.
 *
 * A **fold set** is the keys of the References whose branches are shut. It is
 * a control's own state and never the value's (ADR-0008), but what it *means*
 * is the tree's: which rows it hides, and which of them stand between a
 * Reference and being seen. Those rules live here for the same reason the drag
 * maths above does — the editing control folds today and the read-mode one is
 * to (#153), and a rule each of them owned a copy of would be a rule they were
 * free to disagree about.
 *
 * What a fold *hides*, and what stands above a row, are read off order and
 * depth alone — the same two facts `nestReferences` reads, and the only two a
 * list a caller reshaped mid-drag can still be trusted for.
 *
 * Every one of them takes the fold set as it stands, strangers and all. Keys
 * name positions, so a move or a removal renames them and a set is routinely
 * a little out of date; a rule that threw, or hid the wrong branch, on a key
 * that no longer resolves would turn that into a defect an Author could see.
 */

/** What a fold rule needs of a row: where it sits, and what it is called. */
export type FoldableRow = Pick<ReferenceRow, "depth" | "key">;

/**
 * Above this many References a tree opens with its parents folded; at or
 * below it, expanded.
 *
 * PROVISIONAL — a guess, not a measurement, and #61 says as much: the
 * threshold "wants tuning against a real Spec". Twenty rows is roughly a
 * screenful at the row height the tree draws, which is the point where an
 * expanded tree stops being something an Author takes in at a glance and
 * starts being something they scroll. Below it, folding would only make
 * someone expand a three-item list before they could read it.
 *
 * It is a number about what appears on screen, kept here rather than in a
 * component because it is inseparable from the fold set it produces, and
 * because both renderers of this tree have to open the same way.
 */
export const REFERENCE_TREE_COLLAPSE_THRESHOLD = 20;

/** Whether a Reference has anything under it to fold away. */
export function referenceHasBranch(row: Pick<ReferenceRow, "height">): boolean {
	return row.height > 0;
}

/**
 * The fold set a tree opens with: every Reference that has a branch, once the
 * tree is past {@link REFERENCE_TREE_COLLAPSE_THRESHOLD}, and nothing at all
 * below it.
 *
 * Which leaves the roots on screen — a tree big enough to be worth folding is
 * one an Author meets a level at a time. A leaf is never named: a fold set
 * naming one would claim a row is shut with nothing behind it.
 */
export function initialReferenceFolds(
	rows: readonly Pick<ReferenceRow, "key" | "height">[],
): Set<string> {
	if (rows.length <= REFERENCE_TREE_COLLAPSE_THRESHOLD) return new Set();
	return new Set(rows.filter(referenceHasBranch).map((row) => row.key));
}

/**
 * The rows an Author can see: everything not inside a folded Reference.
 *
 * A folded Reference is on screen itself — it stands in for its branch
 * everywhere else here, and cannot do that from behind its own fold. What it
 * hides is the slice below it that `referenceBranchEnd` bounds, however deep,
 * so a fold nested inside a folded branch costs nothing and says nothing.
 *
 * A fold naming a row with nothing under it hides nothing, and needs no guard
 * of its own to say so: the branch of a leaf is the leaf. That is deliberately
 * asked of the rows below rather than of the row's own `height`, so a leaf, a
 * key that no longer resolves and a row whose cached height is stale all get
 * the one honest answer — what actually follows it.
 *
 * Entries are the caller's own, in the order it holds them, so whatever a row
 * carries — a key for React, a resolved name — travels back on the row.
 */
export function visibleReferenceRows<T extends FoldableRow>(
	rows: readonly T[],
	folded: ReadonlySet<string>,
): T[] {
	const shown: T[] = [];
	let hiddenThrough = -1;
	rows.forEach((row, index) => {
		if (index <= hiddenThrough) return;
		shown.push(row);
		// A key naming a leaf, or naming nothing at all, bounds a branch of one
		// row — itself — and so hides nothing.
		if (folded.has(row.key)) hiddenThrough = referenceBranchEnd(rows, index);
	});
	return shown;
}

/**
 * The keys of everything the row at `index` sits inside — its ancestors,
 * nearest first, which is the order a caller opening its way down meets them.
 *
 * Read off depths rather than off the row's path, so a list a caller built by
 * hand mid-drag answers as readily as one the reader produced. Walking up from
 * the row, each row shallower than the shallowest seen so far is the next
 * ancestor; everything between is a sibling's branch and contains nothing.
 *
 * Empty for a root, and for an index the list does not reach — an ancestor of
 * a row that is not there is not a question with an answer.
 */
export function referenceAncestorKeys(
	rows: readonly FoldableRow[],
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

/**
 * The folds that have to open before the row at `index` can be seen — its
 * ancestors, less the ones already open.
 *
 * This is the whole of what a Reveal does to the fold set (CONTEXT.md): open
 * the way down to a Reference and nothing else. Two things it deliberately
 * leaves alone say why it answers with a subset rather than with every
 * ancestor. Folds elsewhere in the tree are untouched, so Reveals accumulate
 * and a fold an Author opened by hand is never fought; and the revealed
 * Reference's *own* fold stays shut, because a Reveal shows the row and its
 * branch is a separate question.
 *
 * Nearest ancestor first, as `referenceAncestorKeys` answers. Nothing here
 * cares about the order — a caller opens all of them — but an order that is
 * defined is one a caller may rely on.
 */
export function foldsToReveal(
	rows: readonly FoldableRow[],
	index: number,
	folded: ReadonlySet<string>,
): string[] {
	return referenceAncestorKeys(rows, index).filter((key) => folded.has(key));
}
