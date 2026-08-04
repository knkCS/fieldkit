// src/editor/field-settings/use-blueprint-list.ts
import { useEffect, useRef, useState } from "react";
import type {
	BlueprintSummary,
	FieldKitAdapters,
} from "../../renderer/adapters";

/** "unavailable" is both "the adapter cannot list" and "listing failed" — the
 * Author falls back to Blueprint id entry either way, so the panel never has
 * to tell them apart. */
export type BlueprintListStatus = "loading" | "ready" | "unavailable";

export interface BlueprintList {
	blueprints: BlueprintSummary[] | null;
	status: BlueprintListStatus;
}

/**
 * The Blueprints an Author may embed, for the Fieldset config panel's picker
 * (#52). `list` is optional on the adapter, so "no capability" is a normal
 * state here rather than an error — see `FieldKitAdapters["blueprint"]`.
 *
 * A rejected listing is reported through `onFailure` and then treated as no
 * capability at all: the Author gets Blueprint id entry and can still finish
 * the job, which is the point of keeping that fallback. `onFailure` need not
 * be memoized — the hook latches the latest callback.
 */
export function useBlueprintList(
	adapter: FieldKitAdapters["blueprint"],
	onFailure?: (error: Error) => void,
): BlueprintList {
	const [blueprints, setBlueprints] = useState<BlueprintSummary[] | null>(null);
	// Seeded rather than defaulted: the effect runs after the first paint, and
	// an adapter that can list must not flash the id input in the meantime.
	const [status, setStatus] = useState<BlueprintListStatus>(() =>
		adapter?.list ? "loading" : "unavailable",
	);
	// Once per mount, NOT once per adapter identity. A consumer that builds
	// its adapters object inline hands the provider a fresh one on every
	// render of the component above it; keying the fetch on that identity
	// would blank the picker under an Author who is mid-selection.
	const fetched = useRef(false);

	// Call-latest ref: the panel rebuilds its reporter every render, and that
	// identity churn must not be a reason to re-run the fetch effect.
	const onFailureRef = useRef(onFailure);
	useEffect(() => {
		onFailureRef.current = onFailure;
	});

	useEffect(() => {
		if (!adapter?.list) {
			setStatus("unavailable");
			return;
		}
		if (fetched.current) return;
		fetched.current = true;

		let cancelled = false;
		setStatus("loading");
		// Called on the adapter rather than plucked off it: a consumer is free
		// to implement `list` as a method that needs its own `this`.
		adapter
			.list()
			.then((items) => {
				if (cancelled) return;
				setBlueprints(items);
				setStatus("ready");
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				onFailureRef.current?.(
					error instanceof Error ? error : new Error(String(error)),
				);
				setBlueprints(null);
				setStatus("unavailable");
			});

		return () => {
			cancelled = true;
		};
	}, [adapter]);

	return { blueprints, status };
}
