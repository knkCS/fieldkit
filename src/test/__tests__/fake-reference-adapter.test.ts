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

	it("offers Pin targets of the kind it was asked for", async () => {
		const adapter = createFakeReferenceAdapter();

		const releases = await adapter.listPinTargets("article-1", "release");
		const versions = await adapter.listPinTargets("article-1", "version");

		// Two different kinds of thing, told apart by the words alone: a test
		// that picks "Spring release" has proved the Field's mode decided what
		// it was offered.
		expect(releases.map((target) => target.label)).toEqual([
			"Spring release",
			"Launch",
		]);
		expect(versions.map((target) => target.label)).toEqual([
			"Version 3",
			"Version 2",
			"Version 1",
		]);
	});

	it("scopes Pin targets to the Content they belong to", async () => {
		const adapter = createFakeReferenceAdapter();

		const first = await adapter.listPinTargets("article-1", "release");
		const second = await adapter.listPinTargets("article-2", "release");

		// A Pin can never point at another Content's Release, so no id may be
		// shared between two Contents.
		expect(first.map((target) => target.id)).not.toEqual(
			second.map((target) => target.id),
		);
		expect(first[0].id).toContain("article-1");
	});

	it("records which Content and which kind it was asked for", async () => {
		const adapter = createFakeReferenceAdapter();

		await adapter.listPinTargets("article-3", "version");

		expect(adapter.pinTargetQueries).toEqual([
			{ contentId: "article-3", mode: "version" },
		]);
	});

	it("answers with the Pin targets a Content declares for itself", async () => {
		const adapter = createFakeReferenceAdapter({
			contents: [
				{
					id: "only-1",
					display_name: "Only One",
					blueprint_id: "thing",
					pin_targets: {
						release: [{ id: "r-x", label: "The only release" }],
					},
				},
			],
		});

		expect(await adapter.listPinTargets("only-1", "release")).toEqual([
			{ id: "r-x", label: "The only release" },
		]);
		// The kind it did not declare still falls back to the generated ones, so
		// declaring one mode never silently empties the other.
		expect(await adapter.listPinTargets("only-1", "version")).toHaveLength(3);
	});

	it("has no Pin targets for a Content that does not exist", async () => {
		const adapter = createFakeReferenceAdapter();

		expect(await adapter.listPinTargets("deleted-42", "release")).toEqual([]);
	});

	it("rejects a Pin target lookup on demand, for the degrade paths", async () => {
		const adapter = createFakeReferenceAdapter({
			failPinTargets: new Error("pin lookup exploded"),
		});

		await expect(
			adapter.listPinTargets("article-1", "release"),
		).rejects.toThrow("pin lookup exploded");
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
