import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	createFakeReferenceAdapter,
	type FakeReferenceAdapter,
	fakeCatalogue,
} from "../../../test/fake-reference-adapter";
import { FieldKitProvider } from "../../provider";
import { REFERENCE_NAME_BATCH_SIZE } from "../batch-ids";
import { useResolvedContentNames } from "../use-resolved-content-names";

const ACCESSOR = "related";

/**
 * What every Reference surface resolves its names through, driven directly.
 *
 * The recording Adapter is the only place the batching is observable: what a
 * row shows is the same whether its name arrived in one call or fifty, and the
 * promise this makes to a Consumer is about the calls, not the rows.
 */
function renderNames(
	ids: string[],
	{
		adapter,
		onError,
	}: {
		adapter: FakeReferenceAdapter;
		onError?: (error: Error, fieldId: string) => void;
	},
) {
	function Wrapper({ children }: { children: ReactNode }) {
		return (
			<FieldKitProvider
				plugins={[]}
				adapters={{ reference: adapter }}
				onError={onError}
			>
				{children}
			</FieldKitProvider>
		);
	}
	return renderHook(() => useResolvedContentNames(ids, ACCESSOR), {
		wrapper: Wrapper,
	});
}

/** `count` ids over {@link fakeCatalogue}'s Contents — the ids a Reference
 * Tree of that size flattens to, without a tree or a DOM to get them from. */
function catalogueIds(count: number): string[] {
	return fakeCatalogue(count).map((content) => content.id);
}

describe("useResolvedContentNames", () => {
	it("resolves a tree smaller than a batch in exactly one call", async () => {
		const adapter = createFakeReferenceAdapter();
		const ids = ["article-1", "article-2"];

		const { result } = renderNames(ids, { adapter });

		await waitFor(() =>
			expect(result.current).toEqual({
				"article-1": "Cats of the world",
				"article-2": "Dogs of the world",
			}),
		);
		// Indistinguishable from before batching: one call, carrying exactly the
		// ids it was asked for.
		expect(adapter.fetches).toEqual([ids]);
	});

	it("never hands the Adapter a call bigger than the batch size", async () => {
		const count = REFERENCE_NAME_BATCH_SIZE * 3 + 7;
		const adapter = createFakeReferenceAdapter({
			contents: fakeCatalogue(count),
		});
		const ids = catalogueIds(count);

		renderNames(ids, { adapter });

		await waitFor(() => expect(adapter.fetches.flat()).toHaveLength(count));
		for (const call of adapter.fetches) {
			expect(call.length).toBeLessThanOrEqual(REFERENCE_NAME_BATCH_SIZE);
		}
		// Every batch was actually sent, and no id was sent twice or dropped on
		// the way: a lost id is a row that shows an id instead of a name.
		expect(adapter.fetches.flat()).toEqual(ids);
	});

	it("merges every batch into one set of names", async () => {
		const count = REFERENCE_NAME_BATCH_SIZE * 2 + 1;
		const adapter = createFakeReferenceAdapter({
			contents: fakeCatalogue(count),
		});

		const { result } = renderNames(catalogueIds(count), { adapter });

		await waitFor(() =>
			expect(Object.keys(result.current)).toHaveLength(count),
		);
		// The first id, one from the middle batch and the last: a merge that
		// dropped a batch would still look right at one end.
		expect(result.current["article-1"]).toBe("Content 1");
		expect(
			result.current[`article-${String(REFERENCE_NAME_BATCH_SIZE + 5)}`],
		).toBe(`Content ${String(REFERENCE_NAME_BATCH_SIZE + 5)}`);
		expect(result.current[`article-${String(count)}`]).toBe(
			`Content ${String(count)}`,
		);
	});

	it("still shows the names a failed batch's neighbours resolved", async () => {
		const count = REFERENCE_NAME_BATCH_SIZE * 3;
		const onError = vi.fn();
		const adapter = createFakeReferenceAdapter({
			contents: fakeCatalogue(count),
			// One id in the middle batch is enough to reject the call carrying it.
			failFetchIds: [`article-${String(REFERENCE_NAME_BATCH_SIZE + 1)}`],
			failFetch: new Error("that batch was too much"),
		});

		const { result } = renderNames(catalogueIds(count), { adapter, onError });

		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
		);
		// The batches that answered are shown; only the failed one's names are
		// missing, and those rows fall back to their ids as they always have.
		expect(result.current["article-1"]).toBe("Content 1");
		expect(result.current[`article-${String(count)}`]).toBe(
			`Content ${String(count)}`,
		);
		expect(
			result.current[`article-${String(REFERENCE_NAME_BATCH_SIZE + 1)}`],
		).toBeUndefined();
		expect(Object.keys(result.current)).toHaveLength(
			count - REFERENCE_NAME_BATCH_SIZE,
		);
	});

	it("reports a failed resolution once, whatever it cost in calls", async () => {
		const count = REFERENCE_NAME_BATCH_SIZE * 3;
		const onError = vi.fn();
		const adapter = createFakeReferenceAdapter({
			contents: fakeCatalogue(count),
			failFetch: new Error("the Adapter is down"),
		});

		const { result } = renderNames(catalogueIds(count), { adapter, onError });

		await waitFor(() => expect(onError).toHaveBeenCalled());
		// Three calls failed; the Author's Field degraded once. How many calls
		// fieldkit chose to make is fieldkit's business, and a Consumer's error
		// channel must not learn the batch size from it.
		expect(adapter.fetches).toHaveLength(3);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR);
		expect(result.current).toEqual({});
	});

	it("asks for nothing when there are no References to resolve", async () => {
		const adapter = createFakeReferenceAdapter();

		const { result } = renderNames([], { adapter });

		await waitFor(() => expect(result.current).toEqual({}));
		expect(adapter.fetches).toEqual([]);
	});
});
