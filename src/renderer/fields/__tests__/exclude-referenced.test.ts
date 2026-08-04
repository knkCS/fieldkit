import { describe, expect, it } from "vitest";
import { referencedContentIds, withoutExcluded } from "../exclude-referenced";

/**
 * The two halves of "the picker stops offering a Content the Field already
 * holds", asserted without a DOM. Both Reference Field types read them, which
 * is the point: the Single Reference case is a one-item version of the tree's
 * rule, not a second rule.
 */
describe("referencedContentIds", () => {
	it("reads a Reference Tree's roots in the order they are held", () => {
		expect(
			referencedContentIds([{ id: "article-2" }, { id: "article-1" }]),
		).toEqual(["article-2", "article-1"]);
	});

	it("reads every level, not only the roots", () => {
		const tree = [
			{
				id: "a",
				children: [{ id: "b", children: [{ id: "c" }] }],
			},
			{ id: "d" },
		];

		expect(referencedContentIds(tree)).toEqual(["a", "b", "c", "d"]);
	});

	it("reads a Single Reference's one Content", () => {
		expect(referencedContentIds({ id: "article-1" })).toEqual(["article-1"]);
	});

	it("reads nothing from a Field holding nothing", () => {
		expect(referencedContentIds(null)).toEqual([]);
		expect(referencedContentIds(undefined)).toEqual([]);
		expect(referencedContentIds([])).toEqual([]);
	});

	it("drops a malformed entry rather than throwing", () => {
		// Form data is only as well-formed as whatever produced it, and this
		// reads it on the same terms every other surface does.
		expect(
			referencedContentIds(["loose-id", { id: "article-1" }, { id: "" }]),
		).toEqual(["article-1"]);
		expect(referencedContentIds("not a reference")).toEqual([]);
	});

	it("names a Content once even when the tree holds it twice", () => {
		// Legitimate: a tree keys its rows by path precisely so the same Content
		// can appear twice. "Which Contents are in here" is still a set.
		expect(
			referencedContentIds([{ id: "a", children: [{ id: "b" }] }, { id: "b" }]),
		).toEqual(["a", "b"]);
	});
});

describe("withoutExcluded", () => {
	const page = [{ id: "a" }, { id: "b" }, { id: "c" }];

	it("drops the excluded and keeps the order of the rest", () => {
		expect(withoutExcluded(page, ["b"])).toEqual([{ id: "a" }, { id: "c" }]);
	});

	it("keeps the whole page when nothing is excluded", () => {
		expect(withoutExcluded(page, [])).toEqual(page);
	});

	it("has nothing to drop when the Adapter already excluded them", () => {
		expect(withoutExcluded([{ id: "a" }], ["b"])).toEqual([{ id: "a" }]);
	});

	it("answers with a list of its own, never the one it was handed", () => {
		// The caller stores this straight into state; sharing the Adapter's array
		// would let a later mutation of it change what is on screen.
		expect(withoutExcluded(page, [])).not.toBe(page);
	});
});
