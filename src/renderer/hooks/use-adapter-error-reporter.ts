import { useCallback, useEffect, useRef } from "react";
import { useFieldKit } from "../provider";

/**
 * Reports an Adapter failure on the Consumer's own error channel, attributed
 * to the Field the failure degrades.
 *
 * The channel, not the console, because an Adapter failure is the Consumer's
 * to surface — but without a configured `onError` it still reaches the
 * console under `context`, so a degrade is never silent.
 *
 * The returned reporter is stable for the life of the component, behind a
 * call-latest ref, as `useBlueprintList` does for the same reason: a Consumer
 * that builds its provider props inline hands down a fresh `onError` on every
 * render of the component above `FieldKitProvider`, and that identity churn
 * must not re-run an effect that reports through it.
 */
export function useAdapterErrorReporter(
	fieldId: string,
	context: string,
): (error: unknown) => void {
	const { onError } = useFieldKit();
	const latest = useRef({ onError, fieldId, context });
	useEffect(() => {
		latest.current = { onError, fieldId, context };
	});

	return useCallback((error: unknown) => {
		const wrapped = error instanceof Error ? error : new Error(String(error));
		const { onError: report, fieldId: id, context: where } = latest.current;
		if (report) report(wrapped, id);
		else console.error(`${where}:`, wrapped);
	}, []);
}
