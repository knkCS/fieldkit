// src/renderer/spec-form/use-container-orientation.ts
import { type RefObject, useEffect, useState } from "react";

/** Vertical tabs need room for the nav column; below this width they
 * degrade to horizontal so drawers and modals never break. */
export const NARROW_CONTAINER_PX = 560;

export function useContainerOrientation(
	ref: RefObject<HTMLElement | null>,
	configured: "horizontal" | "vertical",
): "horizontal" | "vertical" {
	const [isNarrow, setIsNarrow] = useState(false);

	useEffect(() => {
		if (configured !== "vertical") return;
		if (typeof ResizeObserver === "undefined") return;
		const el = ref.current;
		if (!el) return;

		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0;
			setIsNarrow(width > 0 && width < NARROW_CONTAINER_PX);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref, configured]);

	if (configured === "vertical" && isNarrow) return "horizontal";
	return configured;
}
