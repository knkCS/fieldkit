import { useEffect, useState } from "react";
import { useFieldKit } from "../provider";
import { batchIds } from "./batch-ids";
import { useAdapterErrorReporter } from "./use-adapter-error-reporter";
import { useStableValue } from "./use-stable-value";

/**
 * The current display names of several referenced Contents, keyed by id.
 *
 * A Reference stores only an id (see `Reference` in `/schema`), so names are
 * looked up on every load rather than read out of saved data — a Content
 * renamed elsewhere therefore reads correctly here. An id missing from the
 * result has no name to show: no adapter, a Content that no longer resolves,
 * or a failed lookup. Every caller falls back to the id in that case, so an
 * unresolvable Content is visible rather than gone.
 *
 * Never one `fetch` per row: a Reference Field holding twenty References must
 * not make twenty round trips. Never one `fetch` for ten thousand either — the
 * list is cut into batches by {@link batchIds} and the results merged, so an
 * Adapter written against a Field of twenty keeps working at ten thousand
 * without knowing it (ADR-0013). Which ids are resolved is unchanged: every
 * Reference at every level, not the rows on screen.
 *
 * `fieldId` is only ever used to attribute an Adapter failure to the Field it
 * degrades, through the provider's `onError`.
 */
export function useResolvedContentNames(
	ids: string[],
	fieldId: string,
): Record<string, string> {
	const { adapters } = useFieldKit();
	const adapter = adapters.reference;
	const [names, setNames] = useState<Record<string, string>>({});
	const report = useAdapterErrorReporter(fieldId, "Reference adapter failed");

	// Callers derive this list from form state and hand down a fresh array on
	// every render; an effect keyed on its identity would fetch forever.
	const wanted = useStableValue(ids);

	useEffect(() => {
		if (!adapter || wanted.length === 0) {
			setNames({});
			return;
		}
		let cancelled = false;
		// Settled rather than raced: one batch rejecting must not throw away the
		// names its neighbours resolved, which are as usable as they would have
		// been on their own. A row with no name still falls back to its id.
		Promise.allSettled(
			batchIds(wanted).map((batch) => adapter.fetch(batch)),
		).then((settled) => {
			if (cancelled) return;
			const resolved: Record<string, string> = {};
			for (const outcome of settled) {
				if (outcome.status !== "fulfilled") continue;
				for (const item of outcome.value) {
					resolved[item.id] = item.display_name;
				}
			}
			// One write for the whole set rather than one per batch: a Reference
			// Field re-reads its tree on every render, and a tree of ten thousand
			// must not be re-read once per call. It also keeps the names from
			// flickering back to ids while later batches are still in flight.
			setNames(resolved);
			const failed = settled.find(
				(outcome): outcome is PromiseRejectedResult =>
					outcome.status === "rejected",
			);
			// Once, however many batches failed: how many calls fieldkit chose to
			// make is fieldkit's business, and a Consumer's error channel should
			// not learn the batch size from it. What it reports is what it always
			// reported — this Field's names did not resolve.
			if (failed) report(failed.reason);
		});
		return () => {
			cancelled = true;
		};
	}, [adapter, wanted, report]);

	return names;
}
