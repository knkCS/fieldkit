// src/editor/__tests__/visible-collision.test.ts
import type { ClientRect, DroppableContainer } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { isVisibleDroppable, visibleClosestCenter } from "../visible-collision";

function rect(width: number, height: number): ClientRect {
	return { width, height, top: 0, left: 0, right: width, bottom: height };
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
