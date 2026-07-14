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
export const editorCollision: CollisionDetection = (args) => {
	if (args.pointerCoordinates) {
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
