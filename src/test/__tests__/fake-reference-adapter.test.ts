import { describe, expect, it } from "vitest";
import { createFakeReferenceAdapter } from "../fake-reference-adapter";

/**
 * The fixture every adapter-backed Reference test drives through. Its own
 * behaviour is asserted here so a UI test that says "only articles are
 * offered" is standing on something that actually narrows.
 */
describe("createFakeReferenceAdapter", () => {
	it("narrows a search to the given Blueprints", async () => {
		const adapter = createFakeReferenceAdapter();

		const items = await adapter.search(["author"], "");

		expect(items.map((item) => item.display_name)).toEqual([
			"Ada Lovelace",
			"Grace Hopper",
		]);
	});

	it("treats no Blueprints as no constraint", async () => {
		const adapter = createFakeReferenceAdapter();

		const items = await adapter.search([], "");

		expect(items).toHaveLength(5);
	});

	it("matches a query against the display name, case-insensitively", async () => {
		const adapter = createFakeReferenceAdapter();

		const items = await adapter.search(["article"], "CAT");

		expect(items.map((item) => item.id)).toEqual(["article-1", "article-3"]);
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

		await expect(adapter.search([], "")).rejects.toThrow("search exploded");
		await expect(adapter.fetch(["article-1"])).rejects.toThrow("gateway down");
	});

	it("starts from the catalogue it was given", async () => {
		const adapter = createFakeReferenceAdapter({
			contents: [
				{ id: "only-1", display_name: "Only One", blueprint_id: "thing" },
			],
		});

		expect(await adapter.search(["thing"], "")).toHaveLength(1);
		expect(await adapter.search(["article"], "")).toHaveLength(0);
	});
});
