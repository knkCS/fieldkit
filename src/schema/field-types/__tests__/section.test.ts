import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { SectionSettings } from "../section";
import { sectionPlugin } from "../section";

describe("sectionPlugin", () => {
	it("should have correct metadata", () => {
		expect(sectionPlugin.id).toBe("section");
		expect(sectionPlugin.category).toBe("structural");
	});

	it("should return z.never() from toZodType", () => {
		const field: Field = {
			field_type: "section",
			config: {
				name: "General",
				api_accessor: "general",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = sectionPlugin.toZodType(field);
		// z.never() should reject any value
		expect(zodType.safeParse("anything").success).toBe(false);
		expect(zodType.safeParse(undefined).success).toBe(false);
		expect(zodType.safeParse(null).success).toBe(false);
	});
});

describe("SectionSettings", () => {
	it("accepts an orientation setting", () => {
		const settings: SectionSettings = { orientation: "vertical" };
		expect(settings.orientation).toBe("vertical");
	});

	it("has empty defaultSettings", () => {
		expect(sectionPlugin.defaultSettings).toEqual({});
	});
});
