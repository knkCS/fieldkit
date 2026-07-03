import { describe, expect, it } from "vitest";
import { partitionSchemaBySections } from "../partition";
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

function makeSection(
	accessor: string,
	orientation?: "horizontal" | "vertical",
): Field {
	const section = makeField(accessor, "section");
	return { ...section, settings: orientation ? { orientation } : {} };
}

describe("partitionSchemaBySections", () => {
	it("returns one untabbed partition for a schema without sections", () => {
		const result = partitionSchemaBySections([makeField("a"), makeField("b")]);
		expect(result.hasSections).toBe(false);
		expect(result.tabs).toHaveLength(1);
		expect(result.tabs[0].section).toBeNull();
		expect(result.tabs[0].fields.map((f) => f.config.api_accessor)).toEqual([
			"a",
			"b",
		]);
	});

	it("puts fields before the first section into an implicit first tab", () => {
		const result = partitionSchemaBySections([
			makeField("a"),
			makeSection("s1"),
			makeField("b"),
		]);
		expect(result.hasSections).toBe(true);
		expect(result.tabs).toHaveLength(2);
		expect(result.tabs[0].section).toBeNull();
		expect(result.tabs[0].fields.map((f) => f.config.api_accessor)).toEqual([
			"a",
		]);
		expect(result.tabs[1].section?.config.api_accessor).toBe("s1");
		expect(result.tabs[1].fields.map((f) => f.config.api_accessor)).toEqual([
			"b",
		]);
	});

	it("omits the implicit tab when the schema starts with a section", () => {
		const result = partitionSchemaBySections([
			makeSection("s1"),
			makeField("a"),
			makeSection("s2"),
			makeField("b"),
			makeField("c"),
		]);
		expect(result.tabs).toHaveLength(2);
		expect(result.tabs[0].section?.config.api_accessor).toBe("s1");
		expect(result.tabs[1].fields).toHaveLength(2);
	});

	it("keeps empty sections as empty tabs", () => {
		const result = partitionSchemaBySections([
			makeSection("s1"),
			makeSection("s2"),
			makeField("a"),
		]);
		expect(result.tabs).toHaveLength(2);
		expect(result.tabs[0].fields).toHaveLength(0);
	});

	it("reads orientation from the first section only", () => {
		const result = partitionSchemaBySections([
			makeSection("s1", "vertical"),
			makeField("a"),
			makeSection("s2", "horizontal"),
		]);
		expect(result.orientation).toBe("vertical");
	});

	it("defaults orientation to horizontal", () => {
		expect(partitionSchemaBySections([makeSection("s1")]).orientation).toBe(
			"horizontal",
		);
		expect(partitionSchemaBySections([makeField("a")]).orientation).toBe(
			"horizontal",
		);
	});

	it("returns no tabs for an empty schema", () => {
		const result = partitionSchemaBySections([]);
		expect(result.tabs).toHaveLength(0);
		expect(result.hasSections).toBe(false);
	});
});
