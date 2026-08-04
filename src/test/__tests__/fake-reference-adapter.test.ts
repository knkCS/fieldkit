import { describe, expect, it } from "vitest";
import type { ReferenceSearchQuery } from "../../renderer/adapters";
import {
	createFakeReferenceAdapter,
	fakeCatalogue,
} from "../fake-reference-adapter";

/**
 * The fixture every adapter-backed Reference test drives through. Its own
 * behaviour is asserted here so a UI test that says "only articles are
 * offered" is standing on something that actually narrows.
 */
function query(overrides: Partial<ReferenceSearchQuery> = {}) {
	return {
		blueprintIds: [],
		query: "",
		filters: {},
		page: 1,
		page_size: 50,
		...overrides,
	};
}

describe("createFakeReferenceAdapter", () => {
	it("narrows a search to the given Blueprints", async () => {
		const adapter = createFakeReferenceAdapter();

		const { items } = await adapter.search(query({ blueprintIds: ["author"] }));

		expect(items.map((item) => item.display_name)).toEqual([
			"Ada Lovelace",
			"Grace Hopper",
		]);
	});

	it("treats no Blueprints as no constraint", async () => {
		const adapter = createFakeReferenceAdapter();

		const { items } = await adapter.search(query());

		expect(items).toHaveLength(5);
	});

	it("matches a query against the display name, case-insensitively", async () => {
		const adapter = createFakeReferenceAdapter();

		const { items } = await adapter.search(
			query({ blueprintIds: ["article"], query: "CAT" }),
		);

		expect(items.map((item) => item.id)).toEqual(["article-1", "article-3"]);
	});

	it("narrows by the filter Spec's own values", async () => {
		const adapter = createFakeReferenceAdapter();

		const { items } = await adapter.search(
			query({ filters: { status: "draft" } }),
		);

		expect(items.map((item) => item.id)).toEqual(["article-2", "author-2"]);
	});

	it("treats an unset filter as no constraint", async () => {
		const adapter = createFakeReferenceAdapter();

		const { items } = await adapter.search(query({ filters: { status: "" } }));

		expect(items).toHaveLength(5);
	});

	it("returns one page and the total across every page", async () => {
		const adapter = createFakeReferenceAdapter({ contents: fakeCatalogue(25) });

		const first = await adapter.search(query({ page: 1, page_size: 10 }));
		const third = await adapter.search(query({ page: 3, page_size: 10 }));

		expect(first.items).toHaveLength(10);
		expect(first.total).toBe(25);
		expect(third.items).toHaveLength(5);
		expect(third.total).toBe(25);
		expect(third.items[0].display_name).toBe("Content 21");
	});

	it("counts what the query matched, not the whole catalogue", async () => {
		const adapter = createFakeReferenceAdapter();

		const { total } = await adapter.search(
			query({ blueprintIds: ["article"], query: "cat" }),
		);

		expect(total).toBe(2);
	});

	it("records the query it was called with, untouched", async () => {
		const adapter = createFakeReferenceAdapter();
		const sent = query({ filters: { status: "published", assignee: "u-7" } });

		await adapter.search(sent);

		expect(adapter.searches).toHaveLength(1);
		expect(adapter.searches[0].filters).toEqual({
			status: "published",
			assignee: "u-7",
		});
	});

	it("describes its filters and its result columns as Specs", () => {
		const adapter = createFakeReferenceAdapter();

		expect(
			adapter.getSearchFilters?.().map((f) => f.config.api_accessor),
		).toEqual(["status"]);
		expect(
			adapter.getResultColumns?.().map((f) => f.config.api_accessor),
		).toEqual(["display_name", "status"]);
	});

	it("omits either Spec method on demand, for the degrade paths", () => {
		const adapter = createFakeReferenceAdapter({
			searchFilters: null,
			resultColumns: null,
		});

		expect(adapter.getSearchFilters).toBeUndefined();
		expect(adapter.getResultColumns).toBeUndefined();
	});

	it("returns only the ids that exist", async () => {
		const adapter = createFakeReferenceAdapter();

		const items = await adapter.fetch(["article-1", "deleted-42"]);

		expect(items.map((item) => item.id)).toEqual(["article-1"]);
	});

	it("renames a Content the way an Author elsewhere would", async () => {
		const adapter = createFakeReferenceAdapter();

		adapter.rename("article-1", "Cats, revisited");

		const [item] = await adapter.fetch(["article-1"]);
		expect(item.display_name).toBe("Cats, revisited");
	});

	it("keeps one test's rename out of the next one's catalogue", async () => {
		createFakeReferenceAdapter().rename("article-1", "Mutated");

		const [item] = await createFakeReferenceAdapter().fetch(["article-1"]);
		expect(item.display_name).toBe("Cats of the world");
	});

	it("rejects on demand, for the degrade paths", async () => {
		const adapter = createFakeReferenceAdapter({
			failSearch: new Error("search exploded"),
			failFetch: new Error("gateway down"),
		});

		await expect(adapter.search(query())).rejects.toThrow("search exploded");
		await expect(adapter.fetch(["article-1"])).rejects.toThrow("gateway down");
	});

	it("starts from the catalogue it was given", async () => {
		const adapter = createFakeReferenceAdapter({
			contents: [
				{ id: "only-1", display_name: "Only One", blueprint_id: "thing" },
			],
		});

		expect(
			(await adapter.search(query({ blueprintIds: ["thing"] }))).items,
		).toHaveLength(1);
		expect(
			(await adapter.search(query({ blueprintIds: ["article"] }))).items,
		).toHaveLength(0);
	});
});
