import { describe, expect, it } from "vitest";
import { resolveMarkerConvention } from "../../marker-convention";
import type { Field } from "../../types";
import { getDefaultValues, specToZodSchema } from "../../zod-builder";
import { cardPlugin } from "../card";
import { builtInFieldTypes } from "../index";

function cardField(name = "Details", accessor = "details_card"): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		children: null,
		system: false,
	};
}

describe("cardPlugin", () => {
	it("has correct metadata", () => {
		expect(cardPlugin.id).toBe("card");
		expect(cardPlugin.category).toBe("structural");
		expect(cardPlugin.cellComponent).toBeUndefined();
		expect(cardPlugin.defaultValue).toBeUndefined();
		expect(cardPlugin.defaultSettings).toEqual({});
		expect(cardPlugin.maxPerSpec).toBeUndefined();
	});

	it("returns z.never() from toZodType", () => {
		const zodType = cardPlugin.toZodType(cardField());
		expect(zodType.safeParse("anything").success).toBe(false);
		expect(zodType.safeParse(undefined).success).toBe(false);
		expect(zodType.safeParse(null).success).toBe(false);
	});

	it("is registered in builtInFieldTypes", () => {
		expect(builtInFieldTypes.some((p) => p.id === "card")).toBe(true);
	});
});

describe("zod-builder skips card markers (STRUCTURAL_TYPES)", () => {
	it("specToZodSchema omits the card accessor from the shape", () => {
		const schema = specToZodSchema([cardField()], builtInFieldTypes);
		expect(Object.keys(schema.shape)).not.toContain("details_card");
		// A payload without the marker key parses — z.never() never runs.
		expect(schema.safeParse({}).success).toBe(true);
	});

	it("getDefaultValues never seeds a card accessor — even with an explicit default_value", () => {
		const withDefault = cardField();
		withDefault.config.default_value = "STRAY";
		// The structural skip runs BEFORE the config.default_value branch.
		expect(getDefaultValues([withDefault], builtInFieldTypes)).toEqual({});
	});
});

describe("marker convention ignores card markers", () => {
	it("card markers don't count toward the §10 marker majority", () => {
		const required = (accessor: string): Field => ({
			field_type: "text",
			config: {
				name: accessor,
				api_accessor: accessor,
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		});
		// 2 required + 2 markers: counting markers as optional fields would
		// tie the majority and flip the convention to "asterisk".
		expect(
			resolveMarkerConvention([
				required("a"),
				required("b"),
				cardField("Basics", "c1"),
				cardField("", "c2"),
			]),
		).toBe("optional-text");
	});
});
