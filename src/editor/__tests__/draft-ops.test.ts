import { describe, expect, it } from "vitest";
import { z } from "zod";
import { partitionSchemaBySections } from "../../schema/partition";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import {
	addSection,
	createField,
	deleteSection,
	duplicateField,
	flatInsertIndex,
	insertFieldAt,
	moveField,
	moveFieldToSection,
	moveSection,
	nextAccessor,
	removeField,
	removeFieldAt,
	renameSection,
	setOrientation,
	slugify,
	uniquifyAccessor,
	updateField,
} from "../draft-ops";

function makePlugin(overrides: Partial<FieldTypePlugin> = {}): FieldTypePlugin {
	return {
		id: "text",
		name: "Text",
		description: "Plain text",
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => z.string(),
		...overrides,
	};
}

function f(accessor: string, type = "text"): Field {
	return {
		field_type: type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: type === "section" ? {} : null,
		system: false,
	};
}
const s = (accessor: string) => f(accessor, "section");

describe("field ops", () => {
	it("insertFieldAt inserts at index without mutating input", () => {
		const schema: Schema = [f("a"), f("b")];
		const out = insertFieldAt(schema, f("x"), 1);
		expect(out.map((x) => x.config.api_accessor)).toEqual(["a", "x", "b"]);
		expect(schema).toHaveLength(2);
	});

	it("updateField replaces by accessor", () => {
		const out = updateField([f("a")], "a", {
			...f("a"),
			config: { ...f("a").config, name: "A!" },
		});
		expect(out[0].config.name).toBe("A!");
	});

	it("removeField removes by accessor", () => {
		expect(
			removeField([f("a"), f("b")], "a").map((x) => x.config.api_accessor),
		).toEqual(["b"]);
	});

	it("moveField reorders", () => {
		expect(
			moveField([f("a"), f("b"), f("c")], 0, 2).map(
				(x) => x.config.api_accessor,
			),
		).toEqual(["b", "c", "a"]);
	});

	it("moveField with out-of-range indices is a no-op returning the same reference", () => {
		const schema: Schema = [f("a"), f("b")];
		expect(moveField(schema, -1, 1)).toBe(schema);
		expect(moveField(schema, 2, 0)).toBe(schema);
		expect(moveField(schema, 0, -1)).toBe(schema);
		expect(moveField(schema, 0, 3)).toBe(schema);
	});

	it("moveField(schema, i, i) returns the SAME reference (no-op contract)", () => {
		const schema: Schema = [f("a"), f("b")];
		expect(moveField(schema, 1, 1)).toBe(schema);
	});

	it("updateField with a missing accessor returns the same reference", () => {
		const schema: Schema = [f("a")];
		expect(updateField(schema, "nope", f("x"))).toBe(schema);
	});

	it("removeField with a missing accessor returns the same reference", () => {
		const schema: Schema = [f("a")];
		expect(removeField(schema, "nope")).toBe(schema);
	});

	it("removeFieldAt removes exactly the field at that flat index (F2b: duplicate-accessor safe)", () => {
		// Two fields sharing the same accessor — an accessor-keyed removeField
		// would delete BOTH; removeFieldAt must delete only the one at `index`.
		const dupA = f("dup");
		const dupB = f("dup");
		const schema: Schema = [dupA, dupB];
		const out = removeFieldAt(schema, 1);
		expect(out).toHaveLength(1);
		expect(out[0]).toBe(dupA);
	});

	it("removeFieldAt with an out-of-range index returns the same reference", () => {
		const schema: Schema = [f("a")];
		expect(removeFieldAt(schema, -1)).toBe(schema);
		expect(removeFieldAt(schema, 1)).toBe(schema);
	});

	it("uniquifyAccessor appends _copy, _copy2", () => {
		expect(uniquifyAccessor([f("a")], "a")).toBe("a_copy");
		expect(uniquifyAccessor([f("a"), f("a_copy")], "a")).toBe("a_copy2");
		expect(uniquifyAccessor([f("a")], "b")).toBe("b");
	});

	it("duplicateField inserts the copy directly after the original", () => {
		const out = duplicateField([f("a"), f("b")], "a");
		expect(out.map((x) => x.config.api_accessor)).toEqual(["a", "a_copy", "b"]);
		expect(out[1].config.name).toBe("a");
	});

	it("duplicateField forces system: false on the copy", () => {
		const sys = { ...f("a"), system: true };
		const out = duplicateField([sys], "a");
		expect(out[1].system).toBe(false);
	});

	it("nextAccessor uses numeric suffixes for fresh inserts", () => {
		expect(nextAccessor([f("text")], "text")).toBe("text_2");
		expect(nextAccessor([f("text"), f("text_2")], "text")).toBe("text_3");
		expect(nextAccessor([], "text")).toBe("text");
	});

	it("slugify lowercases, spaces-to-underscores, and strips invalid chars", () => {
		expect(slugify("My Field!")).toBe("my_field");
		expect(slugify("")).toBe("");
	});

	it("createField builds a fresh Field from a plugin's id/name/defaultSettings", () => {
		const plugin = makePlugin({
			id: "select",
			name: "Select",
			defaultSettings: { options: [] },
		});
		const out = createField(plugin, [f("a")]);
		expect(out).toEqual({
			field_type: "select",
			config: {
				name: "Select",
				api_accessor: "select",
				required: false,
				instructions: "",
			},
			settings: { options: [] },
			system: false,
		});
	});

	it("createField uniquifies the accessor via nextAccessor and falls back to null settings", () => {
		const plugin = makePlugin({ id: "text", name: "Text" });
		const out = createField(plugin, [f("text")]);
		expect(out.config.api_accessor).toBe("text_2");
		expect(out.settings).toBeNull();
		expect(out.system).toBe(false);
	});
});

describe("section ops", () => {
	it("addSection appends a section marker with slugified unique accessor", () => {
		const out = addSection([f("a")], "My Tab");
		const last = out[out.length - 1];
		expect(last.field_type).toBe("section");
		expect(last.config.name).toBe("My Tab");
		expect(last.config.api_accessor).toBe("my_tab");
	});

	it("renameSection renames the marker", () => {
		const out = renameSection([s("s1"), f("a")], "s1", "Renamed");
		expect(out[0].config.name).toBe("Renamed");
	});

	it("renameSection with a missing accessor returns the same reference", () => {
		const schema: Schema = [s("s1"), f("a")];
		expect(renameSection(schema, "nope", "Renamed")).toBe(schema);
	});

	it("deleteSection with a missing accessor returns the same reference", () => {
		const schema: Schema = [f("a"), s("s1"), f("b")];
		expect(deleteSection(schema, "nope")).toBe(schema);
	});

	it("moveSection moves the whole block", () => {
		// [a][s1 b][s2 c] — move s2 left → [a][s2 c][s1 b]
		const out = moveSection(
			[f("a"), s("s1"), f("b"), s("s2"), f("c")],
			"s2",
			-1,
		);
		expect(out.map((x) => x.config.api_accessor)).toEqual([
			"a",
			"s2",
			"c",
			"s1",
			"b",
		]);
	});

	it("moveSection right swaps two sections", () => {
		// [s1 a][s2 b] — move s1 right → [s2 b][s1 a]
		const out = moveSection([s("s1"), f("a"), s("s2"), f("b")], "s1", 1);
		expect(out.map((x) => x.config.api_accessor)).toEqual([
			"s2",
			"b",
			"s1",
			"a",
		]);
	});

	it("moveSection right moves the middle of three sections", () => {
		// [s1 a][s2 b][s3 c] — move s2 right → [s1 a][s3 c][s2 b]
		const out = moveSection(
			[s("s1"), f("a"), s("s2"), f("b"), s("s3"), f("c")],
			"s2",
			1,
		);
		expect(out.map((x) => x.config.api_accessor)).toEqual([
			"s1",
			"a",
			"s3",
			"c",
			"s2",
			"b",
		]);
	});

	it("moveSection right on the first of three lands adjacent (one step)", () => {
		// [s1 a][s2 b][s3 c] — move s1 right → [s2 b][s1 a][s3 c]
		const out = moveSection(
			[s("s1"), f("a"), s("s2"), f("b"), s("s3"), f("c")],
			"s1",
			1,
		);
		expect(out.map((x) => x.config.api_accessor)).toEqual([
			"s2",
			"b",
			"s1",
			"a",
			"s3",
			"c",
		]);
	});

	it("moveSection left on the FIRST section is a no-op (implicit tab is fixed)", () => {
		const schema = [f("a"), s("s1"), f("b")];
		expect(moveSection(schema, "s1", -1)).toBe(schema);
	});

	it("moveSection right on the last section is a no-op", () => {
		const schema = [s("s1"), f("a"), s("s2"), f("b")];
		expect(moveSection(schema, "s2", 1)).toBe(schema);
	});

	it("moveSection on a single-section schema is a no-op in both directions", () => {
		const schema = [f("a"), s("s1"), f("b")];
		expect(moveSection(schema, "s1", 1)).toBe(schema);
		expect(moveSection(schema, "s1", -1)).toBe(schema);
	});

	it("deleteSection removes only the marker (fields merge left)", () => {
		const out = deleteSection([f("a"), s("s1"), f("b")], "s1");
		expect(out.map((x) => x.config.api_accessor)).toEqual(["a", "b"]);
	});

	it("setOrientation writes the FIRST section's settings", () => {
		const out = setOrientation([s("s1"), f("a"), s("s2")], "vertical");
		expect((out[0].settings as { orientation?: string }).orientation).toBe(
			"vertical",
		);
		expect(
			(out[2].settings as { orientation?: string })?.orientation,
		).toBeUndefined();
	});

	it("moveFieldToSection appends the field to the target tab", () => {
		// tabs: 0=[a] (implicit), 1=[s1: b] — move a into tab 1
		const out = moveFieldToSection([f("a"), s("s1"), f("b")], "a", 1);
		expect(out.map((x) => x.config.api_accessor)).toEqual(["s1", "b", "a"]);
	});

	it("moveSection transfers orientation to the new first section, forward and back (F7)", () => {
		const s1Vertical: Field = {
			...s("s1"),
			settings: { orientation: "vertical" },
		};
		const schema: Schema = [s1Vertical, f("a"), s("s2"), f("b")];

		// Move s1 (first, vertical) right — s2 becomes first.
		const moved = moveSection(schema, "s1", 1);
		expect(moved.map((x) => x.config.api_accessor)).toEqual([
			"s2",
			"b",
			"s1",
			"a",
		]);
		expect(partitionSchemaBySections(moved).orientation).toBe("vertical");
		expect(
			(
				moved.find((x) => x.config.api_accessor === "s1")?.settings as {
					orientation?: string;
				} | null
			)?.orientation,
		).toBeUndefined();

		// Move it back — s2 (now carrying the setting) moves right past s1.
		const movedBack = moveSection(moved, "s2", 1);
		expect(movedBack.map((x) => x.config.api_accessor)).toEqual([
			"s1",
			"a",
			"s2",
			"b",
		]);
		expect(partitionSchemaBySections(movedBack).orientation).toBe("vertical");
		expect(
			(
				movedBack.find((x) => x.config.api_accessor === "s2")?.settings as {
					orientation?: string;
				} | null
			)?.orientation,
		).toBeUndefined();
	});

	it("moveSection with no orientation set on the first section transfers nothing (no spurious settings)", () => {
		const schema: Schema = [s("s1"), f("a"), s("s2"), f("b")];
		const moved = moveSection(schema, "s1", 1);
		expect(
			(
				moved.find((x) => x.config.api_accessor === "s2")?.settings as {
					orientation?: string;
				} | null
			)?.orientation,
		).toBeUndefined();
		expect(partitionSchemaBySections(moved).orientation).toBe("horizontal");
	});
});

describe("flatInsertIndex", () => {
	it("empty schema → 0", () => {
		const schema: Schema = [];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 0, 0)).toBe(0);
	});

	it("sectionless schema: top-of-tab lands before the first field", () => {
		const schema: Schema = [f("a"), f("b")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 0, 0)).toBe(0);
	});

	it("sectionless schema: middle-of-tab lands between fields", () => {
		const schema: Schema = [f("a"), f("b")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 0, 1)).toBe(1);
	});

	it("sectionless schema: end-of-tab lands after the last field", () => {
		const schema: Schema = [f("a"), f("b")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 0, 2)).toBe(2);
	});

	it("top-of-tab under a section lands right after the marker", () => {
		// [s1][a][b] — top of tab 0 (the s1 tab) is right after the marker
		const schema: Schema = [s("s1"), f("a"), f("b")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 0, 0)).toBe(1);
	});

	it("middle-of-tab under a section lands between its fields", () => {
		// [s1][a][b][s2][c] — position 1 of tab 0 is between a and b
		const schema: Schema = [s("s1"), f("a"), f("b"), s("s2"), f("c")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 0, 1)).toBe(2);
	});

	it("empty tab: position 0 lands right after its marker", () => {
		// [a][s1] — implicit tab 0 has "a", tab 1 (s1) is empty
		const schema: Schema = [f("a"), s("s1")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 1, 0)).toBe(2);
	});

	it("out-of-range tab index falls back to the end of the schema", () => {
		const schema: Schema = [f("a")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 5, 0)).toBe(1);
	});

	it("position overflow clamps to the end of the tab (implicit tab)", () => {
		// Without clamping, position > fields.length on the implicit tab fell
		// through to 0 (front) instead of the tab's end.
		const schema: Schema = [f("a"), f("b")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 0, 5)).toBe(2);
	});

	it("position overflow clamps to the end of the tab (sectioned tab)", () => {
		// [s1][a][s2][c] — overflow position on tab 0 must land after "a",
		// not right after the s1 marker.
		const schema: Schema = [s("s1"), f("a"), s("s2"), f("c")];
		const partition = partitionSchemaBySections(schema);
		expect(flatInsertIndex(schema, partition, 0, 9)).toBe(2);
	});
});
