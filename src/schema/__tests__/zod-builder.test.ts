// src/schema/__tests__/zod-builder.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { getDefaultValues, specToZodSchema } from "../zod-builder";

function mockPlugin(id: string, zodType: z.ZodTypeAny): FieldTypePlugin {
	return {
		id,
		name: id,
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => zodType,
	};
}

describe("specToZodSchema", () => {
	const plugins = [
		mockPlugin("text", z.string()),
		mockPlugin("number", z.number()),
		mockPlugin("boolean", z.boolean()),
	];

	it("should generate a Zod object schema from fields", () => {
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Name",
					api_accessor: "name",
					required: true,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "number",
				config: {
					name: "Age",
					api_accessor: "age",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, plugins);
		const result = schema.safeParse({ name: "John", age: 30 });
		expect(result.success).toBe(true);
	});

	it("should make required fields non-optional", () => {
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Name",
					api_accessor: "name",
					required: true,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, plugins);
		const result = schema.safeParse({ name: "" });
		expect(result.success).toBe(true);
	});

	it("should skip hidden fields from schema", () => {
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Name",
					api_accessor: "name",
					required: true,
					instructions: "",
					hidden: true,
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "text",
				config: {
					name: "Title",
					api_accessor: "title",
					required: true,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, plugins);
		expect(schema.shape).not.toHaveProperty("name");
		expect(schema.shape).toHaveProperty("title");
		// Hidden field should not cause validation failure when omitted
		const result = schema.safeParse({ title: "Mr" });
		expect(result.success).toBe(true);
	});

	it("should skip section fields (structural only)", () => {
		const sectionPlugin: FieldTypePlugin = {
			id: "section",
			name: "Section",
			description: "",
			icon: () => null,
			category: "structural",
			fieldComponent: () => null,
			toZodType: () => z.never(),
		};
		const fields: Field[] = [
			{
				field_type: "section",
				config: {
					name: "Info",
					api_accessor: "info_section",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "text",
				config: {
					name: "Name",
					api_accessor: "name",
					required: true,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, [...plugins, sectionPlugin]);
		const shape = schema.shape;
		expect(shape).not.toHaveProperty("info_section");
		expect(shape).toHaveProperty("name");
	});

	it("should support overrides", () => {
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Email",
					api_accessor: "email",
					required: true,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, plugins, {
			overrides: {
				email: (base) => base.pipe(z.string().email("Invalid email")),
			},
		});
		const result = schema.safeParse({ email: "not-an-email" });
		expect(result.success).toBe(false);
	});

	it("should skip fields with unknown field types", () => {
		const fields: Field[] = [
			{
				field_type: "unknown_type",
				config: {
					name: "X",
					api_accessor: "x",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, plugins);
		expect(Object.keys(schema.shape)).toHaveLength(0);
	});
});

describe("getDefaultValues", () => {
	it("should extract default values from field configs", () => {
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Name",
					api_accessor: "name",
					required: true,
					instructions: "",
					default_value: "Untitled",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "number",
				config: {
					name: "Count",
					api_accessor: "count",
					required: false,
					instructions: "",
					default_value: 0,
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "text",
				config: {
					name: "Note",
					api_accessor: "note",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const defaults = getDefaultValues(fields);
		expect(defaults).toEqual({ name: "Untitled", count: 0 });
	});

	it("should return empty object when no defaults", () => {
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Name",
					api_accessor: "name",
					required: true,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		expect(getDefaultValues(fields)).toEqual({});
	});
});
