import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { ArraySettings } from "../array";
import { arrayPlugin } from "../array";

describe("arrayPlugin", () => {
	it("should have correct metadata", () => {
		expect(arrayPlugin.id).toBe("array");
		expect(arrayPlugin.category).toBe("structural");
	});

	it("should generate dynamic mode Zod type (array of key-value objects)", () => {
		const field: Field<ArraySettings> = {
			field_type: "array",
			config: {
				name: "Metadata",
				api_accessor: "metadata",
				required: false,
				instructions: "",
			},
			settings: { mode: "dynamic" },
			children: null,
			system: false,
		};
		const zodType = arrayPlugin.toZodType(field);
		expect(zodType.safeParse([]).success).toBe(true);
		expect(zodType.safeParse([{ key: "color", value: "red" }]).success).toBe(
			true,
		);
		expect(
			zodType.safeParse([
				{ key: "color", value: "red" },
				{ key: "size", value: "large" },
			]).success,
		).toBe(true);
		expect(zodType.safeParse("not an array").success).toBe(false);
	});

	it("should default to dynamic mode when no mode specified", () => {
		const field: Field<ArraySettings> = {
			field_type: "array",
			config: {
				name: "Metadata",
				api_accessor: "metadata",
				required: false,
				instructions: "",
			},
			settings: {},
			children: null,
			system: false,
		};
		const zodType = arrayPlugin.toZodType(field);
		expect(zodType.safeParse([]).success).toBe(true);
		expect(zodType.safeParse([{ key: "a", value: "b" }]).success).toBe(true);
	});

	it("should generate keyed mode Zod type (record of strings)", () => {
		const field: Field<ArraySettings> = {
			field_type: "array",
			config: {
				name: "Settings",
				api_accessor: "settings",
				required: false,
				instructions: "",
			},
			settings: { mode: "keyed", keys: ["color", "size", "weight"] },
			children: null,
			system: false,
		};
		const zodType = arrayPlugin.toZodType(field);
		expect(zodType.safeParse({}).success).toBe(true);
		expect(zodType.safeParse({ color: "red", size: "large" }).success).toBe(
			true,
		);
		expect(zodType.safeParse("not a record").success).toBe(false);
	});
});
