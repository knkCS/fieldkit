import { describe, expect, it } from "vitest";
import { partitionTabByCards } from "../partition-cards";
import type { Field } from "../types";

function makeField(accessor: string, type = "text"): Field {
	return {
		field_type: type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

function makeCard(accessor: string, name = accessor): Field {
	const card = makeField(accessor, "card");
	return { ...card, config: { ...card.config, name }, settings: {} };
}

describe("partitionTabByCards", () => {
	it("returns a single implicit group for a tab without cards", () => {
		const result = partitionTabByCards([makeField("a"), makeField("b")]);
		expect(result.hasCards).toBe(false);
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0].card).toBeNull();
		expect(result.cards[0].fields.map((f) => f.config.api_accessor)).toEqual([
			"a",
			"b",
		]);
	});

	it("groups fields under the preceding card marker", () => {
		const result = partitionTabByCards([
			makeCard("c1", "Basics"),
			makeField("a"),
			makeField("b"),
			makeCard("c2", "Extra"),
			makeField("x"),
		]);
		expect(result.hasCards).toBe(true);
		expect(result.cards).toHaveLength(2);
		expect(result.cards[0].card?.config.api_accessor).toBe("c1");
		expect(result.cards[0].fields.map((f) => f.config.api_accessor)).toEqual([
			"a",
			"b",
		]);
		expect(result.cards[1].card?.config.api_accessor).toBe("c2");
		expect(result.cards[1].fields.map((f) => f.config.api_accessor)).toEqual([
			"x",
		]);
	});

	it("puts leading loose fields into an implicit null-card group (degrade rule)", () => {
		const result = partitionTabByCards([
			makeField("loose"),
			makeCard("c1", "Basics"),
			makeField("a"),
		]);
		expect(result.hasCards).toBe(true);
		expect(result.cards).toHaveLength(2);
		expect(result.cards[0].card).toBeNull();
		expect(result.cards[0].fields.map((f) => f.config.api_accessor)).toEqual([
			"loose",
		]);
		expect(result.cards[1].card?.config.api_accessor).toBe("c1");
	});

	it("preserves untitled cards (empty name) and empty cards", () => {
		const result = partitionTabByCards([
			makeCard("c1", ""),
			makeCard("c2", "Named"),
			makeField("a"),
		]);
		expect(result.cards).toHaveLength(2);
		expect(result.cards[0].card?.config.name).toBe("");
		expect(result.cards[0].fields).toEqual([]);
		expect(result.cards[1].fields).toHaveLength(1);
	});

	it("returns no groups for an empty tab", () => {
		expect(partitionTabByCards([])).toEqual({ cards: [], hasCards: false });
	});

	it("does not mutate its input", () => {
		const input = [makeCard("c1", "X"), makeField("a")];
		const snapshot = [...input];
		partitionTabByCards(input);
		expect(input).toEqual(snapshot);
	});
});
