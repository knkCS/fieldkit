import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { specToZodSchema } from "../../zod-builder";
import type { GroupSettings } from "../group";
import { groupPlugin } from "../group";
import { builtInFieldTypes } from "../index";

describe("groupPlugin", () => {
	it("should have correct metadata", () => {
		expect(groupPlugin.id).toBe("group");
		expect(groupPlugin.category).toBe("structural");
	});

	it("should generate array Zod type", () => {
		const field: Field<GroupSettings> = {
			field_type: "group",
			config: {
				name: "Items",
				api_accessor: "items",
				required: false,
				instructions: "",
			},
			settings: {},
			children: null,
			system: false,
		};
		const zodType = groupPlugin.toZodType(field);
		expect(zodType.safeParse([]).success).toBe(true);
		expect(zodType.safeParse([{ _id: "r22", foo: "bar" }]).success).toBe(true);
		expect(zodType.safeParse("not an array").success).toBe(false);
	});

	it("should apply min_items constraint", () => {
		const field: Field<GroupSettings> = {
			field_type: "group",
			config: {
				name: "Items",
				api_accessor: "items",
				required: false,
				instructions: "",
			},
			settings: { min_items: 2 },
			children: null,
			system: false,
		};
		const zodType = groupPlugin.toZodType(field);
		expect(zodType.safeParse([{ _id: "r23", a: 1 }]).success).toBe(false);
		expect(
			zodType.safeParse([
				{ _id: "r24", a: 1 },
				{ _id: "r25", b: 2 },
			]).success,
		).toBe(true);
	});

	it("should apply max_items constraint", () => {
		const field: Field<GroupSettings> = {
			field_type: "group",
			config: {
				name: "Items",
				api_accessor: "items",
				required: false,
				instructions: "",
			},
			settings: { max_items: 3 },
			children: null,
			system: false,
		};
		const zodType = groupPlugin.toZodType(field);
		expect(
			zodType.safeParse([
				{ _id: "r26", a: 1 },
				{ _id: "r27", b: 2 },
				{ _id: "r28", c: 3 },
			]).success,
		).toBe(true);
		expect(
			zodType.safeParse([
				{ _id: "r29", a: 1 },
				{ _id: "r30", b: 2 },
				{ _id: "r31", c: 3 },
				{ _id: "r32", d: 4 },
			]).success,
		).toBe(false);
	});

	describe("row validation", () => {
		const child = (accessor: string, required: boolean): Field => ({
			field_type: "text",
			config: {
				name: accessor,
				api_accessor: accessor,
				required,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		});

		const group = (children: Field[] | null): Field<GroupSettings> => ({
			field_type: "group",
			config: {
				name: "Authors",
				api_accessor: "authors",
				required: false,
				instructions: "",
			},
			settings: {},
			children,
			system: false,
		});

		const schema = (children: Field[] | null) =>
			specToZodSchema([group(children)], builtInFieldTypes);

		it("blocks submit on a required field in one row, and says which row", () => {
			const parsed = schema([child("name", true)]).safeParse({
				authors: [
					{ _id: "r33", name: "Ada" },
					{ _id: "r34", name: "" },
				],
			});
			expect(parsed.success).toBe(false);
			// The path react-hook-form registers the row's field under.
			expect(parsed.error?.issues[0].path).toEqual(["authors", 1, "name"]);
		});

		it("lets an optional field in a row stay empty", () => {
			expect(
				schema([child("name", false)]).safeParse({
					authors: [{ _id: "r35", name: "" }],
				}).success,
			).toBe(true);
		});

		it("keeps keys the row's fields don't describe", () => {
			// A stored row carries more than the Spec edits — a backend id, most
			// obviously. Validating rows must not start pruning them.
			const parsed = schema([child("name", true)]).safeParse({
				authors: [{ _id: "r36", id: 7, name: "Ada" }],
			});
			expect(parsed.data).toEqual({
				authors: [{ _id: "r36", id: 7, name: "Ada" }],
			});
		});

		it("stays an opaque row where the group has no children", () => {
			expect(
				schema(null).safeParse({ authors: [{ _id: "r37", anything: 1 }] })
					.success,
			).toBe(true);
		});
	});

	it("should apply both min_items and max_items constraints", () => {
		const field: Field<GroupSettings> = {
			field_type: "group",
			config: {
				name: "Items",
				api_accessor: "items",
				required: false,
				instructions: "",
			},
			settings: { min_items: 1, max_items: 3 },
			children: null,
			system: false,
		};
		const zodType = groupPlugin.toZodType(field);
		expect(zodType.safeParse([]).success).toBe(false);
		expect(zodType.safeParse([{ _id: "r38", a: 1 }]).success).toBe(true);
		expect(
			zodType.safeParse([
				{ _id: "r39", a: 1 },
				{ _id: "r40", b: 2 },
				{ _id: "r41", c: 3 },
			]).success,
		).toBe(true);
		expect(
			zodType.safeParse([
				{ _id: "r42", a: 1 },
				{ _id: "r43", b: 2 },
				{ _id: "r44", c: 3 },
				{ _id: "r45", d: 4 },
			]).success,
		).toBe(false);
	});
});
