// src/renderer/spec-form/use-container-orientation.ts
import { useCallback, useEffect, useState } from "react";

/** Vertical tabs need room for the nav column; below this width they
 * degrade to horizontal so drawers and modals never break. */
export const NARROW_CONTAINER_PX = 560;

/**
 * Tracks the observed container element as state (via a callback ref)
 * rather than a `RefObject`, so that when the element mounts on a later
 * render (e.g. after a loading skeleton is replaced by real content) the
 * effect re-runs and the ResizeObserver actually attaches. A `RefObject`'s
 * identity never changes across renders, so an effect depending on it would
 * never re-fire once the ref's `.current` is populated after the fact.
 */
export function useContainerOrientation(
	configured: "horizontal" | "vertical",
): {
	orientation: "horizontal" | "vertical";
	containerRef: (node: HTMLElement | null) => void;
} {
	const [element, setElement] = useState<HTMLElement | null>(null);
	const [isNarrow, setIsNarrow] = useState(false);
	const containerRef = useCallback((node: HTMLElement | null) => {
		setElement(node);
	}, []);

	useEffect(() => {
		if (configured !== "vertical") return;
		if (typeof ResizeObserver === "undefined") return;
		if (!element) return;

		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0;
			setIsNarrow(width > 0 && width < NARROW_CONTAINER_PX);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [element, configured]);

	return {
		orientation:
			configured === "vertical" && isNarrow ? "horizontal" : configured,
		containerRef,
	};
}
