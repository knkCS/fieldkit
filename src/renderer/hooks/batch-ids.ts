/**
 * How a list of Content ids is cut up before it is handed to an Adapter.
 *
 * A Reference Field resolves a display name for every Reference at every level
 * (ADR-0013), so a tree of ten thousand References is ten thousand ids to
 * resolve. Handing all of them to `fetch` in one call makes the Adapter's
 * transport limits and its query planner the thing that breaks — in a Consumer
 * whose Adapter was written against a Field of twenty and is correct for it.
 *
 * So fieldkit cuts the list up itself. The batch size is **fieldkit's, not the
 * Adapter's**: the adapter interface is unchanged, nothing is asked of a
 * Consumer, and an Adapter never learns how big the tree it is serving is.
 */

/**
 * How many ids one `fetch` may carry.
 *
 * PROVISIONAL — a guess, not a measurement, on the same terms as the Reference
 * Tree's collapse threshold. A hundred ids is a call most transports carry
 * without complaint: inside a URL length limit for an Adapter that sends a GET
 * even with ids the size of a UUID, and a short enough list for a query
 * planner asked to match on it. Parent #143 says as much — this number and the
 * Find result cap are both numbers this repo has not yet earned, and the first
 * Consumer to measure one should change it here.
 *
 * Nothing above this is a hard failure that would be caught in testing: too
 * large and it breaks only at a Consumer whose transport is stricter than
 * ours, too small and it costs round trips. That is exactly why it wants
 * measuring against a real Adapter rather than reasoning.
 */
export const REFERENCE_NAME_BATCH_SIZE = 100;

/**
 * `ids` split into batches of at most `size`, in the order they were given.
 *
 * Order and repeats are preserved: the tree keys its rows by path, so the same
 * Content may sit in it more than once, and deduplicating here would make a
 * small tree send a different call than it does today. An empty list yields no
 * batches at all rather than one empty one — nothing to resolve is no round
 * trip, not a round trip that can only come back empty.
 *
 * A pure function, and deliberately not a hook: this is the whole of the
 * batching rule, so it can be asserted directly instead of through a rendered
 * Field and a fake Adapter. `size` is a parameter for the same reason — the
 * rule is easier to read at three than at a hundred — and every caller in the
 * Field passes nothing and gets {@link REFERENCE_NAME_BATCH_SIZE}.
 *
 * A size below one never terminates, and a fractional one slices at
 * unpredictable places. Guarded rather than trusted because the batch size is a
 * number this repo openly expects someone to change once they have measured it,
 * and a hung browser is a poor way to find out the edit was wrong.
 */
export function batchIds(
	ids: readonly string[],
	size: number = REFERENCE_NAME_BATCH_SIZE,
): string[][] {
	if (!Number.isInteger(size) || size < 1) {
		throw new RangeError(
			`batchIds needs a whole batch size of at least 1, got ${String(size)}`,
		);
	}
	const batches: string[][] = [];
	for (let start = 0; start < ids.length; start += size) {
		batches.push(ids.slice(start, start + size));
	}
	return batches;
}
