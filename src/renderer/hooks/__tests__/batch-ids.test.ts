import { describe, expect, it } from "vitest";
import { batchIds, REFERENCE_NAME_BATCH_SIZE } from "../batch-ids";

/**
 * The rule that decides how many `fetch` calls a Reference Field makes,
 * asserted without an Adapter, a hook or a DOM.
 *
 * Every id in the tree is still resolved (ADR-0013) — this only says how the
 * list is cut up on the way out, so the arithmetic is worth pinning on its own:
 * a lost id is a row that falls back to showing its id, and a Find that cannot
 * see it.
 */
describe("batchIds", () => {
	it("asks for nothing when there is nothing to resolve", () => {
		// Not `[[]]`: an empty batch would be a round trip that could only come
		// back empty.
		expect(batchIds([], 3)).toEqual([]);
	});

	it("sends a list shorter than one batch in a single call", () => {
		// The whole of "a small tree is indistinguishable from before batching":
		// one call, carrying exactly what the caller asked for.
		expect(batchIds(["a", "b"], 3)).toEqual([["a", "b"]]);
	});

	it("sends a list exactly one batch long in a single call", () => {
		expect(batchIds(["a", "b", "c"], 3)).toEqual([["a", "b", "c"]]);
	});

	it("divides a list that fits the batch size exactly, with no empty tail", () => {
		expect(batchIds(["a", "b", "c", "d", "e", "f"], 3)).toEqual([
			["a", "b", "c"],
			["d", "e", "f"],
		]);
	});

	it("leaves the remainder in a shorter last batch", () => {
		expect(batchIds(["a", "b", "c", "d"], 3)).toEqual([["a", "b", "c"], ["d"]]);
	});

	it("keeps every id, once each and in order, across the batches", () => {
		const ids = Array.from({ length: 250 }, (_, index) => `article-${index}`);

		const batches = batchIds(ids, 100);

		expect(batches.flat()).toEqual(ids);
		expect(batches.map((batch) => batch.length)).toEqual([100, 100, 50]);
	});

	it("never fills a batch past the size it was given", () => {
		const ids = Array.from({ length: 47 }, (_, index) => `article-${index}`);

		for (const batch of batchIds(ids, 10)) {
			expect(batch.length).toBeLessThanOrEqual(10);
		}
	});

	it("keeps a Content the tree holds twice in both places", () => {
		// The tree keys its rows by path, so the same Content may sit in it more
		// than once and the same id arrives twice. Deduplicating here would make
		// a small tree send fewer ids than it does today, which is a change this
		// rule has no business making.
		expect(batchIds(["a", "b", "a"], 2)).toEqual([["a", "b"], ["a"]]);
	});

	it("refuses a batch size that could never finish", () => {
		expect(() => batchIds(["a"], 0)).toThrow(RangeError);
		expect(() => batchIds(["a"], -1)).toThrow(RangeError);
	});

	it("ships a whole number of ids as its batch size", () => {
		// A fraction or a zero here would be a fat finger away from a Field that
		// fetches forever or not at all.
		expect(Number.isInteger(REFERENCE_NAME_BATCH_SIZE)).toBe(true);
		expect(REFERENCE_NAME_BATCH_SIZE).toBeGreaterThan(0);
	});
});
