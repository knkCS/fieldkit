// src/editor/visible-collision.ts
import {
	type CollisionDetection,
	closestCenter,
	type DroppableContainer,
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
