import { describe, expect, it } from "vitest";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";

function mockPlugin(
	id: string,
	opts?: { maxPerSpec?: number },
): FieldTypePlugin {
	return {
		id,
		name: id,
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => null as never,
		maxPerSpec: opts?.maxPerSpec,
	};
}

function mockField(type: string, accessor: string): Field {
	return {
		field_type: type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
	};
}

describe("validateSpec", () => {
	it("should return valid for spec within constraints", () => {
		const plugins = new Map([["text", mockPlugin("text")]]);
		const fields = [mockField("text", "name"), mockField("text", "title")];
		const result = validateSpec(fields, plugins);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("should return error when maxPerSpec is exceeded", () => {
		const plugins = new Map([
			["toc_reference", mockPlugin("toc_reference", { maxPerSpec: 1 })],
		]);
		const fields = [
			mockField("toc_reference", "toc1"),
			mockField("toc_reference", "toc2"),
		];
		const result = validateSpec(fields, plugins);
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("toc_reference");
	});

	it("should allow exactly maxPerSpec fields", () => {
		const plugins = new Map([
			["toc_reference", mockPlugin("toc_reference", { maxPerSpec: 1 })],
		]);
		const fields = [mockField("toc_reference", "toc1")];
		const result = validateSpec(fields, plugins);
		expect(result.valid).toBe(true);
	});
});

describe("validateSpec — accessor checks", () => {
	const plugins = new Map([["text", mockPlugin("text")]]);

	function f(accessor: string, name = accessor): Field {
		return {
			field_type: "text",
			config: {
				name,
				api_accessor: accessor,
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
	}

	it("reports duplicate accessors with fieldErrors", () => {
		const result = validateSpec([f("a"), f("a")], plugins);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors).toContainEqual({
			accessor: "a",
			code: "duplicate_accessor",
			message: 'Duplicate accessor "a"',
		});
	});

	it("reports empty name and empty accessor", () => {
		const result = validateSpec([f("", "")], plugins);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors.length).toBeGreaterThanOrEqual(1);
	});

	it("keeps fieldErrors empty for a valid spec", () => {
		const result = validateSpec([f("a"), f("b")], plugins);
		expect(result.valid).toBe(true);
		expect(result.fieldErrors).toEqual([]);
	});

	function group(accessor: string, children: Field[]): Field {
		return {
			field_type: "group",
			config: {
				name: accessor,
				api_accessor: accessor,
				required: false,
				instructions: "",
			},
			settings: null,
			children,
			system: false,
		};
	}

	it("reports empty name for a group child (F5)", () => {
		const child = f("item_name", "");
		const result = validateSpec([group("items", [child])], plugins);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors).toContainEqual({
			accessor: "item_name",
			code: "empty_name",
			message: "Name must not be empty",
		});
	});

	it("reports duplicate_accessor for two children within the SAME group (F5)", () => {
		const result = validateSpec(
			[group("items", [f("dup"), f("dup")])],
			plugins,
		);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors).toContainEqual({
			accessor: "dup",
			code: "duplicate_accessor",
			message: 'Duplicate accessor "dup"',
		});
	});

	it("does NOT flag the same accessor reused across DIFFERENT groups (namespaced, F5)", () => {
		const result = validateSpec(
			[group("group_a", [f("x")]), group("group_b", [f("x")])],
			plugins,
		);
		expect(result.valid).toBe(true);
		expect(
			result.fieldErrors.filter((e) => e.code === "duplicate_accessor"),
		).toEqual([]);
	});

	it("does NOT flag a child accessor colliding with a top-level accessor (namespaced, F5)", () => {
		const result = validateSpec([f("x"), group("items", [f("x")])], plugins);
		expect(result.valid).toBe(true);
		expect(
			result.fieldErrors.filter((e) => e.code === "duplicate_accessor"),
		).toEqual([]);
	});
});
