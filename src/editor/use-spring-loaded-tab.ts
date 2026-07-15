// src/editor/use-spring-loaded-tab.ts
import { useEffect, useRef } from "react";

/** Pointer dwell before a hovered tab trigger springs the canvas to that
 * section (spring-loaded sections spec 2026-07-14, Decision 1). ONE tuned
 * constant; keyboard drags bypass the dwell entirely (Decision 6). */
export const SPRING_DWELL_MS = 500;

/**
 * Owns the spring dwell timer: while `enabled` and a tab trigger is the
 * hovered zone (`pendingTabIndex`), fire `onSpring(tabIndex)` once after
 * `delayMs`. Any change of the pending zone (drag moved off the strip, onto
 * another trigger, or the drag ended → null) cancels the armed timer —
 * crossing the strip quickly never springs. Re-hovering (null → index)
 * re-arms, so springs chain within one drag.
 */
export function useSpringLoadedTab({
	pendingTabIndex,
	enabled,
	onSpring,
	delayMs = SPRING_DWELL_MS,
}: {
	pendingTabIndex: number | null;
	enabled: boolean;
	onSpring: (tabIndex: number) => void;
	delayMs?: number;
}): void {
	// Call-latest: the timer must invoke the callback identity from the
	// render it FIRES in, not the one it was armed in (the onDirtyChange
	// idiom from spec-editor.tsx).
	const onSpringRef = useRef(onSpring);
	onSpringRef.current = onSpring;

	useEffect(() => {
		if (!enabled || pendingTabIndex == null) return;
		const timer = setTimeout(
			() => onSpringRef.current(pendingTabIndex),
			delayMs,
		);
		return () => clearTimeout(timer);
	}, [pendingTabIndex, enabled, delayMs]);
}
