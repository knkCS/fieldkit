// src/editor/__tests__/visible-collision.test.ts
import type { ClientRect, DroppableContainer } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import {
	editorCollision,
	isVisibleDroppable,
	visibleClosestCenter,
} from "../visible-collision";

function rect(width: number, height: number): ClientRect {
	return { width, height, top: 0, left: 0, right: width, bottom: height };
}

function prect(
	left: number,
	top: number,
	width: number,
	height: number,
): ClientRect {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
	};
}

function container(
	id: string,
	size: { width: number; height: number } | null,
): DroppableContainer {
	return {
		id,
		key: id,
		data: { current: undefined },
		disabled: false,
		node: { current: null },
		rect: { current: size ? rect(size.width, size.height) : null },
	};
}

describe("isVisibleDroppable (F3)", () => {
	it("excludes zero-width/zero-height rects — a hidden tab's mounted-but-invisible shells", () => {
		expect(
			isVisibleDroppable(container("hidden", { width: 0, height: 0 })),
		).toBe(false);
	});

	it("keeps unmeasured (null rect) containers — nothing to exclude yet", () => {
		expect(isVisibleDroppable(container("unmeasured", null))).toBe(true);
	});

	it("keeps nonzero-size rects", () => {
		expect(
			isVisibleDroppable(container("visible", { width: 100, height: 40 })),
		).toBe(true);
	});
});

describe("visibleClosestCenter (F3)", () => {
	it("never resolves a collision onto a zero-rect (hidden-tab) container", () => {
		const args: Parameters<typeof visibleClosestCenter>[0] = {
			active: {
				id: "dragged",
				data: { current: undefined },
				rect: { current: { initial: null, translated: null } },
			},
			collisionRect: rect(10, 10),
			droppableRects: new Map([
				["hidden", rect(0, 0)],
				["visible", rect(50, 40)],
			]),
			droppableContainers: [
				container("hidden", { width: 0, height: 0 }),
				container("visible", { width: 50, height: 40 }),
			],
			pointerCoordinates: null,
		};

		const collisions = visibleClosestCenter(args);
		expect(collisions.map((c) => c.id)).toEqual(["visible"]);
	});
});

/** Geometry measured in the 2026-07-14 tab-drop probe: the dragged row is
 * canvas-wide (its CENTER sits ~540px right of a tab trigger even when the
 * pointer is dead-center on it), so closestCenter alone can never resolve a
 * tab-trigger zone for pointer drags — some full-width shell below is
 * always nearer. */
const TAB_ZONE = prect(119, 222, 86, 40); // small trigger chip, top-left
const SHELL = prect(36, 300, 1330, 110); // full-width field row
// The dragged row's rect while the POINTER hovers the tab trigger's center:
const COLLISION_RECT = prect(36, 187, 1330, 110); // center (701, 242)
const POINTER_ON_TAB = { x: 162, y: 242 }; // tab zone's center

function tabArgs(
	pointerCoordinates: { x: number; y: number } | null,
	collisionRect: ClientRect = COLLISION_RECT,
): Parameters<typeof editorCollision>[0] {
	return {
		active: {
			id: "dragged",
			data: { current: undefined },
			rect: { current: { initial: null, translated: null } },
		},
		collisionRect,
		droppableRects: new Map([
			["tabdrop-1", TAB_ZONE],
			["shell-a", SHELL],
		]),
		droppableContainers: [
			container("tabdrop-1", {
				width: TAB_ZONE.width,
				height: TAB_ZONE.height,
			}),
			container("shell-a", { width: SHELL.width, height: SHELL.height }),
		],
		pointerCoordinates,
	};
}

describe("editorCollision (tab-trigger reachability)", () => {
	it("pointer inside a tab trigger resolves the tab zone — even though closestCenter prefers the nearer full-width shell", () => {
		// Discriminator: the base strategy alone picks the shell.
		const base = visibleClosestCenter(tabArgs(POINTER_ON_TAB));
		expect(base[0]?.id).toBe("shell-a");

		const collisions = editorCollision(tabArgs(POINTER_ON_TAB));
		expect(collisions[0]?.id).toBe("tabdrop-1");
	});

	it("pointer outside every tab trigger falls back to closestCenter (tabs never hijack in-list drags)", () => {
		const collisions = editorCollision(tabArgs({ x: 700, y: 355 }));
		expect(collisions[0]?.id).toBe("shell-a");
	});

	it("keyboard drags (no pointer coordinates) keep closestCenter parity — the coordinate getter moves the rect onto the zone", () => {
		// Keyboard: dnd-kit places the collision rect ON the tab zone.
		const onTab = prect(119, 222, 86, 40);
		const collisions = editorCollision(tabArgs(null, onTab));
		expect(collisions[0]?.id).toBe("tabdrop-1");
	});

	it("still filters hidden (zero-rect) droppables in the fallback path", () => {
		const args = tabArgs({ x: 700, y: 355 });
		args.droppableContainers.push(container("hidden", { width: 0, height: 0 }));
		args.droppableRects.set("hidden", rect(0, 0));
		const collisions = editorCollision(args);
		expect(collisions.map((c) => c.id)).not.toContain("hidden");
	});
});
