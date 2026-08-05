// src/renderer/fields/use-spring-loaded-branch.ts
/**
 * The Reference Tree's spring: rest a drag on a folded Reference and its branch
 * opens, so a slot inside it becomes something an Author can aim at (tree
 * drag-feedback spec 2026-08-05, Decision 8).
 *
 * It is the editor canvas's `useSpringLoadedTab` in tree terms, and a
 * deliberate copy rather than a share: `/renderer` imports nothing from
 * `/editor`, and a Consumer taking the Reference Field should not pull the
 * specification editor in behind it. What travels between the two is the *feel*
 * — the dwell below is the same number, so one gesture means one thing across
 * the package — not the module.
 */
import { useEffect, useRef } from "react";

/**
 * Pointer dwell before a hovered folded Reference springs open.
 *
 * Deliberately the same number as `/editor`'s `SPRING_DWELL_MS`
 * (`src/editor/use-spring-loaded-tab.ts`): resting on a target mid-drag to
 * reveal more of the tree is one interaction, and two constants would be two
 * feels. Restated rather than imported because there is no `renderer → editor`
 * dependency and this feature is not the place to open one. **They move
 * together or not at all.**
 *
 * Keyboard drags bypass the dwell entirely, exactly as the editor's do: a
 * keyboard drop into a folded branch already lands at its end and unfolds it,
 * so there is nothing a dwell would add.
 */
export const SPRING_DWELL_MS = 500;

export interface SpringLoadedBranchInput {
	/**
	 * The folded Reference the drag is resting on, keyed as the tree keys its
	 * rows, or null when it is resting on nothing that could spring.
	 */
	pendingKey: string | null;
	/** Pointer drags only — the dwell is a safety device against a drive-by
	 * spring, and a keyboard drag is deliberate already. */
	enabled: boolean;
	/** Unfolds the branch. Called once per dwell. */
	onSpring: (key: string) => void;
	delayMs?: number;
}

/**
 * Owns the dwell timer: while `enabled` and a folded Reference is under the
 * drag (`pendingKey`), fire `onSpring(key)` once after `delayMs`. Any change of
 * the row underneath — the drag moved off it, onto another folded one, or the
 * drag ended → null — cancels the armed timer, so crossing a folded Reference
 * quickly never springs it. Re-hovering re-arms, so springs chain within one
 * drag.
 */
export function useSpringLoadedBranch({
	pendingKey,
	enabled,
	onSpring,
	delayMs = SPRING_DWELL_MS,
}: SpringLoadedBranchInput): void {
	// Call-latest: the timer must invoke the callback identity from the render
	// it FIRES in, not the one it was armed in — the same idiom
	// `useSpringLoadedTab` uses, and for the same reason: the fold this closes
	// over is a whole drag old by the time the dwell elapses.
	const onSpringRef = useRef(onSpring);
	onSpringRef.current = onSpring;

	useEffect(() => {
		if (!enabled || pendingKey === null) return;
		const timer = setTimeout(() => onSpringRef.current(pendingKey), delayMs);
		return () => clearTimeout(timer);
	}, [pendingKey, enabled, delayMs]);
}
