import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { VirtualTableSettings } from "../virtual-table";
import { virtualTablePlugin } from "../virtual-table";

describe("virtualTablePlugin", () => {
	it("should have correct metadata", () => {
		expect(virtualTablePlugin.id).toBe("virtual_table");
		expect(virtualTablePlugin.category).toBe("reference");
	});

	it("should generate array of record objects Zod type", () => {
		const field: Field<VirtualTableSettings> = {
			field_type: "virtual_table",
			config: {
				name: "Entries",
				api_accessor: "entries",
				required: false,
				instructions: "",
			},
			settings: { blueprint: "articles" },
			children: null,
			system: false,
		};
		const zodType = virtualTablePlugin.toZodType(field);
		expect(zodType.safeParse([]).success).toBe(true);
		expect(zodType.safeParse([{ title: "Hello", count: 42 }]).success).toBe(
			true,
		);
		expect(zodType.safeParse([{ nested: { a: 1 } }]).success).toBe(true);
	});

	it("should reject non-array values", () => {
		const field: Field<VirtualTableSettings> = {
			field_type: "virtual_table",
			config: {
				name: "Entries",
				api_accessor: "entries",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = virtualTablePlugin.toZodType(field);
		expect(zodType.safeParse("not an array").success).toBe(false);
		expect(zodType.safeParse(42).success).toBe(false);
	});

	it("should have default settings with max_records_per_page", () => {
		expect(virtualTablePlugin.defaultSettings).toEqual({
			max_records_per_page: 25,
		});
	});
});
