import { describe, expect, it } from "vitest";
import type { Field, Schema } from "../../schema/types";
import {
	deleteCardMerge,
	deleteCardWithFields,
	insertCard,
	moveCard,
} from "../draft-ops";

function f(accessor: string, type = "text"): Field {
	return {
		field_type: type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: type === "section" || type === "card" ? {} : null,
		system: false,
	};
}
const s = (accessor: string) => f(accessor, "section");
const c = (accessor: string) => f(accessor, "card");
const ids = (schema: Schema) =>
	schema.map((x) => `${x.field_type}:${x.config.api_accessor}`);

describe("insertCard", () => {
	it("first card in a tab with loose fields WRAPS them, then appends the new card", () => {
		const schema: Schema = [f("a"), f("b")];
		const out = insertCard(schema, 0);
		// A skipped wrap would produce [a, b, card] — loose fields in a carded
		// tab — so this assertion discriminates the auto-wrap itself.
		expect(ids(out)).toEqual(["card:card", "text:a", "text:b", "card:card_2"]);
		// Both markers are untitled (Decision 3/4 — naming happens in the panel).
		expect(out[0].config.name).toBe("");
		expect(out[3].config.name).toBe("");
		expect(schema).toHaveLength(2); // pure
	});

	it("appends WITHOUT wrapping when the tab already has cards", () => {
		const schema: Schema = [c("c1"), f("a")];
		const out = insertCard(schema, 0);
		expect(ids(out)).toEqual(["card:c1", "text:a", "card:card"]);
	});

	it("appends a single marker to an empty tab (no wrap)", () => {
		const schema: Schema = [s("s1")];
		const out = insertCard(schema, 0);
		expect(ids(out)).toEqual(["section:s1", "card:card"]);
	});

	it("targets the requested tab in a sectioned schema", () => {
		const schema: Schema = [f("a"), s("s1"), f("b")];
		const out = insertCard(schema, 1);
		expect(ids(out)).toEqual([
			"text:a", // implicit tab untouched
			"section:s1",
			"card:card", // wrap for "b"
			"text:b",
			"card:card_2", // the new empty card, LAST card of the tab
		]);
	});

	it("returns the same reference for an out-of-range tab", () => {
		const schema: Schema = [f("a")];
		expect(insertCard(schema, 5)).toBe(schema);
		expect(insertCard([], 0)).toEqual([]);
	});
});

describe("moveCard", () => {
	it("moves the marker AND its contained fields as one block (after)", () => {
		const schema: Schema = [c("c1"), f("a"), f("b"), c("c2"), f("x")];
		const out = moveCard(schema, "c1", "c2", "after");
		// A marker-only move would leave a/b behind under c2.
		expect(ids(out)).toEqual([
			"card:c2",
			"text:x",
			"card:c1",
			"text:a",
			"text:b",
		]);
		expect(ids(schema)).toEqual([
			"card:c1",
			"text:a",
			"text:b",
			"card:c2",
			"text:x",
		]); // pure
	});

	it('"before" places the block ahead of the target block', () => {
		const schema: Schema = [c("c1"), f("a"), c("c2"), f("x")];
		const out = moveCard(schema, "c2", "c1", "before");
		expect(ids(out)).toEqual(["card:c2", "text:x", "card:c1", "text:a"]);
	});

	it("a card block ends at a section marker", () => {
		const schema: Schema = [c("c1"), f("a"), s("s1"), c("c2"), f("x")];
		const out = moveCard(schema, "c2", "c1", "before");
		// c1's block is [c1, a] only — s1 stays put.
		expect(ids(out)).toEqual([
			"card:c2",
			"text:x",
			"card:c1",
			"text:a",
			"section:s1",
		]);
	});

	it("no-ops (same reference) for self, missing card, or missing target", () => {
		const schema: Schema = [c("c1"), f("a"), c("c2")];
		expect(moveCard(schema, "c1", "c1", "after")).toBe(schema);
		expect(moveCard(schema, "nope", "c2", "after")).toBe(schema);
		expect(moveCard(schema, "c1", "nope", "after")).toBe(schema);
	});
});

describe("deleteCardMerge", () => {
	it("merges into the PREVIOUS card (marker-only removal)", () => {
		const schema: Schema = [c("c1"), f("a"), c("c2"), f("b")];
		const out = deleteCardMerge(schema, "c2");
		expect(ids(out)).toEqual(["card:c1", "text:a", "text:b"]);
	});

	it("first card: fields merge into the NEXT card (its marker is hoisted)", () => {
		const schema: Schema = [c("c1"), f("a"), c("c2"), f("b")];
		const out = deleteCardMerge(schema, "c1");
		// "a" must NOT end up loose before c2's marker.
		expect(ids(out)).toEqual(["card:c2", "text:a", "text:b"]);
	});

	it("only card: the tab returns to the bare card-less state", () => {
		const schema: Schema = [s("s1"), c("c1"), f("a"), f("b")];
		const out = deleteCardMerge(schema, "c1");
		expect(ids(out)).toEqual(["section:s1", "text:a", "text:b"]);
	});

	it("first-card merge is tab-scoped (a previous tab's card doesn't count)", () => {
		const schema: Schema = [c("c0"), f("z"), s("s1"), c("c1"), f("a")];
		const out = deleteCardMerge(schema, "c1");
		// c1 is the FIRST card of ITS tab; there is no next card → bare state.
		expect(ids(out)).toEqual(["card:c0", "text:z", "section:s1", "text:a"]);
	});

	it("no-ops for a missing card", () => {
		const schema: Schema = [c("c1"), f("a")];
		expect(deleteCardMerge(schema, "nope")).toBe(schema);
	});
});

describe("deleteCardWithFields", () => {
	it("removes the marker and every contained field", () => {
		const schema: Schema = [c("c1"), f("a"), c("c2"), f("b")];
		const out = deleteCardWithFields(schema, "c1");
		expect(ids(out)).toEqual(["card:c2", "text:b"]);
		expect(schema).toHaveLength(4); // pure
	});

	it("stops at a section boundary", () => {
		const schema: Schema = [c("c1"), f("a"), s("s1"), f("z")];
		const out = deleteCardWithFields(schema, "c1");
		expect(ids(out)).toEqual(["section:s1", "text:z"]);
	});

	it("no-ops for a missing card", () => {
		const schema: Schema = [f("a")];
		expect(deleteCardWithFields(schema, "nope")).toBe(schema);
	});
});
