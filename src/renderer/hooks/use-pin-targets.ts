import { useEffect, useState } from "react";
import type { PinMode } from "../../schema/reference";
import type { PinTarget } from "../adapters";
import { useFieldKit } from "../provider";
import { useAdapterErrorReporter } from "./use-adapter-error-reporter";

/** What one Content offers to be pinned to, and whether that answer has
 * arrived. */
export interface PinTargets {
	targets: PinTarget[];
	loading: boolean;
}

/** Nothing to pin to, and nothing on its way — the answer for a Field that
 * does not pin, and for one with no Content chosen yet. A module constant, so
 * the identity is stable across renders. */
const NONE: PinTargets = { targets: [], loading: false };

/**
 * What one Content may be pinned to, in the kind the Field's `pin_mode` asked
 * for.
 *
 * Both pinning controls read the Adapter through this — the tree Field's second
 * step and the Single Reference's second select — so the rules live in one
 * place, following the precedent `useResolvedContentNames` set for resolving
 * names.
 *
 * The rule that matters most is the reset: **the previous Content's targets are
 * dropped the instant the Content changes**, before the new ones arrive. A Pin
 * can never point at another Content's target, so a control must never be able
 * to offer one — not even for the width of a round trip.
 *
 * Asks nothing at all when the Field does not pin, or when no Content is
 * chosen. A failure leaves an empty list, which every caller shows alongside
 * the newest Version, and is reported through the provider's `onError` against
 * `fieldId` — the Field it degrades.
 */
export function usePinTargets(
	contentId: string | null,
	mode: PinMode,
	fieldId: string,
): PinTargets {
	const { adapters } = useFieldKit();
	const adapter = adapters.reference;
	const [state, setState] = useState<PinTargets>(NONE);
	const report = useAdapterErrorReporter(fieldId, "Reference adapter failed");

	useEffect(() => {
		if (!adapter || !contentId || mode === "none") {
			setState(NONE);
			return;
		}
		let cancelled = false;
		// Emptied, not merely marked loading: what is on screen must never
		// outlive the Content it belonged to.
		setState({ targets: [], loading: true });
		adapter
			.listPinTargets(contentId, mode)
			.then((targets) => {
				if (cancelled) return;
				setState({ targets, loading: false });
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setState(NONE);
				report(error);
			});
		return () => {
			cancelled = true;
		};
	}, [adapter, contentId, mode, report]);

	return state;
}
