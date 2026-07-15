// src/editor/visible-collision.ts
import {
	type CollisionDetection,
	closestCenter,
	type DroppableContainer,
	pointerWithin,
} from "@dnd-kit/core";

/**
 * F3: every tab's field shells stay mounted in the editor's single
 * DndContext — Tabs.Content hides an inactive panel via CSS, never unmounts
 * it (see spec-form.tsx's "NEVER pass lazyMount" rationale) — so hidden
 * tabs' shells register as sortables too. A hidden shell measures as a
 * zero-size rect pinned at (0,0); plain `closestCenter` doesn't know to
 * skip it, so a drag near the viewport's origin can resolve `over` into a
 * field belonging to a completely different (hidden) tab, silently
 * relocating the dragged field into the wrong section with no visual cue.
 *
 * A droppable with no rect measured YET (`null`) is kept — that's not
 * "hidden", just "not measured this frame" — closestCenter's own lookup
 * against `droppableRects` already skips anything truly absent.
 */
export function isVisibleDroppable(container: DroppableContainer): boolean {
	const rect = container.rect.current;
	return !rect || (rect.width > 0 && rect.height > 0);
}

/** Drop-in replacement for `closestCenter` that first filters out hidden
 * (zero-rect) droppable containers — tab-trigger drop zones (`tabdrop-*`)
 * are always visible and unaffected. */
export const visibleClosestCenter: CollisionDetection = (args) =>
	closestCenter({
		...args,
		droppableContainers: args.droppableContainers.filter(isVisibleDroppable),
	});

/**
 * The canvas collision strategy: `pointerWithin` for tab-trigger zones,
 * `visibleClosestCenter` for everything else.
 *
 * closestCenter compares the DRAGGED RECT's center against droppable
 * centers — and the dragged row is canvas-wide, so its center sits
 * hundreds of px away from a small tab trigger even while the pointer is
 * dead-center on it; some full-width shell below always wins and the tab
 * zones are unreachable by mouse (measured 2026-07-14; keyboard drags were
 * unaffected because the coordinate getter moves the rect ONTO each zone).
 * "Is the pointer inside the trigger?" is the correct test for a small
 * discrete control, so tab zones get first claim via the pointer; keyboard
 * drags carry no pointer coordinates and fall through to the base strategy
 * unchanged.
 */
/** How far outside the union of visible droppable rects a pointer may
 * wander before the drag resolves NOTHING (#45). Generous enough that
 * edge-hugging drags and the tab-strip→panel gutter never no-op; small
 * enough that a deliberate drag-away to the page margin clears the
 * feedback and turns the release into a restore-and-no-op. */
export const OUTSIDE_CANVAS_SLACK_PX = 96;

/** True when the pointer sits outside the slack-expanded bounding box of
 * every VISIBLE droppable. closestCenter has no distance cutoff — it
 * always returns the nearest candidate, however far (measured: a
 * post-spring drag to the page corner still committed a drop, fieldkit#45
 * / the 0.12.0 gate's one failed leg) — so far-outside pointers must be
 * cut off BEFORE the fallback. Zero-size (hidden) rects are excluded:
 * they measure at (0,0) and would drag the union to the page origin. */
function pointerOutsideCanvas(
	pointer: { x: number; y: number },
	droppableRects: Parameters<CollisionDetection>[0]["droppableRects"],
): boolean {
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	let any = false;
	for (const rect of droppableRects.values()) {
		if (rect.width <= 0 || rect.height <= 0) continue;
		any = true;
		if (rect.left < left) left = rect.left;
		if (rect.top < top) top = rect.top;
		if (rect.right > right) right = rect.right;
		if (rect.bottom > bottom) bottom = rect.bottom;
	}
	if (!any) return false; // nothing measured yet — never no-op on that
	return (
		pointer.x < left - OUTSIDE_CANVAS_SLACK_PX ||
		pointer.x > right + OUTSIDE_CANVAS_SLACK_PX ||
		pointer.y < top - OUTSIDE_CANVAS_SLACK_PX ||
		pointer.y > bottom + OUTSIDE_CANVAS_SLACK_PX
	);
}

export const editorCollision: CollisionDetection = (args) => {
	if (args.pointerCoordinates) {
		if (pointerOutsideCanvas(args.pointerCoordinates, args.droppableRects)) {
			return [];
		}
		const tabZones = args.droppableContainers.filter(
			(c) => String(c.id).startsWith("tabdrop-") && isVisibleDroppable(c),
		);
		if (tabZones.length > 0) {
			const hits = pointerWithin({ ...args, droppableContainers: tabZones });
			if (hits.length > 0) return hits;
		}
	}
	return visibleClosestCenter(args);
};
