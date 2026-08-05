import { useEffect, useMemo, useState } from "react";
import type { ReferenceNameProgress } from "../../schema/reference-find";
import type { FieldKitAdapters } from "../adapters";
import { useFieldKit } from "../provider";
import { batchIds } from "./batch-ids";
import { useAdapterErrorReporter } from "./use-adapter-error-reporter";
import { useStableValue } from "./use-stable-value";

/** What one settled lookup left behind, and the question it answered. */
interface Settled {
	/**
	 * The exact list, and the exact Adapter, this answers for — held by
	 * identity, which is what makes "has this question been answered?" a
	 * comparison rather than a guess.
	 */
	ids: readonly string[];
	adapter: FieldKitAdapters["reference"];
	/** The names that arrived, merged across every batch that answered. */
	names: Record<string, string>;
	/** Whether a batch never answered — names this lookup will not produce. */
	incomplete: boolean;
}

/** What {@link useResolvedContentNames} answers with: the names, and how they
 * came to be the names. */
export interface ResolvedContentNames {
	/** The display names that have arrived, keyed by Content id. */
	names: Record<string, string>;
	/** What the lookup behind them is doing — see
	 * {@link ReferenceNameProgress}. */
	progress: ReferenceNameProgress;
}

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
 * **The progress beside the record is not a nicety.** Because the names are
 * written once, when the whole set settles, an empty record means three
 * unrelated things — not yet, no Adapter, or asked and never answered — and a
 * caller that reports an absence to an Author has to tell them apart. A row
 * does not care: it falls back to its id in all three. Find does, because
 * "nothing in this tree matches" and "the tree has not finished arriving" are
 * different sentences and only one of them is true at a time (#152, ADR-0013).
 *
 * `fieldId` is only ever used to attribute an Adapter failure to the Field it
 * degrades, through the provider's `onError`.
 */
export function useResolvedContentNames(
	ids: string[],
	fieldId: string,
): ResolvedContentNames {
	const { adapters } = useFieldKit();
	const adapter = adapters.reference;
	const [settled, setSettled] = useState<Settled | null>(null);
	const report = useAdapterErrorReporter(fieldId, "Reference adapter failed");

	// Callers derive this list from form state and hand down a fresh array on
	// every render; an effect keyed on its identity would fetch forever.
	const wanted = useStableValue(ids);

	useEffect(() => {
		if (!adapter || wanted.length === 0) {
			setSettled({ ids: wanted, adapter, names: {}, incomplete: false });
			return;
		}
		let cancelled = false;
		// Settled rather than raced: one batch rejecting must not throw away the
		// names its neighbours resolved, which are as usable as they would have
		// been on their own. A row with no name still falls back to its id.
		//
		// Every batch is asked for at once, and nothing here limits how many are
		// in flight — the browser's own per-origin connection limit is what
		// paces them. Bounding them ourselves would be a second number this repo
		// has not measured, on top of the batch size; if a Consumer's rate limit
		// turns out to be what breaks, that is the measurement that should
		// decide it rather than a guess made here.
		Promise.allSettled(
			batchIds(wanted).map((batch) => adapter.fetch(batch)),
		).then((outcomes) => {
			if (cancelled) return;
			const resolved: Record<string, string> = {};
			for (const outcome of outcomes) {
				if (outcome.status !== "fulfilled") continue;
				for (const item of outcome.value) {
					resolved[item.id] = item.display_name;
				}
			}
			// One write for the whole set rather than one per batch. The rows on
			// screen are spread across every batch — a collapsed tree shows its
			// roots, and they are scattered right through the flattened list — so
			// writing per batch would name a patchwork of rows and leave their
			// neighbours reading as ids until the last call landed. It also keeps
			// a Field that re-reads its whole tree on every render from doing so
			// once per call. The cost is that one slow batch holds up every name,
			// which is the same thing one slow call did before there were
			// batches.
			const failed = outcomes.find(
				(outcome): outcome is PromiseRejectedResult =>
					outcome.status === "rejected",
			);
			// The names and what is missing from them, written together: whether
			// a gap is a Content with no name or a call that never came back is
			// exactly what a reader of the record alone cannot tell, and two
			// writes would leave a render able to see one without the other.
			setSettled({
				ids: wanted,
				adapter,
				names: resolved,
				incomplete: failed !== undefined,
			});
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

	// Derived from what has settled rather than raised and lowered by the effect
	// that fetches. An effect runs *after* the render that scheduled it, so a
	// flag it sets is false for the paint an Author first sees and false again
	// for the render in which a growing tree asks its new question — both of
	// them renders where a control would report a complete answer over names
	// that have not arrived. Comparing what settled against what is wanted has
	// no such window: a question nothing has answered yet is outstanding in the
	// same render it is asked.
	//
	// The Adapter is part of the question, not just the ids: a Consumer that
	// swaps one in is asking the same ids of somebody else.
	const pending =
		adapter !== undefined &&
		wanted.length > 0 &&
		(settled?.ids !== wanted || settled.adapter !== adapter);

	return useMemo(
		() => ({
			// Whatever last settled, even while a newer question is outstanding:
			// a name already on screen must not blink back to an id because the
			// tree gained a Reference. `progress.pending` is what says it is
			// provisional; emptying the record would be saying it twice, and
			// destructively.
			names: settled?.names ?? {},
			progress: { pending, incomplete: settled?.incomplete ?? false },
		}),
		[settled, pending],
	);
}
