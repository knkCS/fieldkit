// src/schema/__tests__/zod-builder.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { getDefaultValues, specToZodSchema } from "../zod-builder";

function mockPlugin(
	id: string,
	zodType: z.ZodTypeAny,
	defaultValue?: (field: Field) => unknown,
): FieldTypePlugin {
	return {
		id,
		name: id,
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => zodType,
		...(defaultValue ? { defaultValue } : {}),
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

	it("should allow empty string for optional string fields without constraints", () => {
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Title",
					api_accessor: "title",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, plugins);
		expect(schema.safeParse({ title: "" }).success).toBe(true);
		expect(schema.safeParse({ title: undefined }).success).toBe(true);
	});

	it("should allow empty string for optional string fields WITH constraints (#38)", () => {
		const constrainedPlugin = mockPlugin("text", z.string().min(2));
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Title",
					api_accessor: "title",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, [constrainedPlugin]);
		// undefined should be allowed (optional)
		expect(schema.safeParse({ title: undefined }).success).toBe(true);
		// empty string SHOULD pass — optional fields can be cleared (#38)
		expect(schema.safeParse({ title: "" }).success).toBe(true);
		// valid value should pass
		expect(schema.safeParse({ title: "ab" }).success).toBe(true);
	});

	it("should use plain optional for non-string types", () => {
		const fields: Field[] = [
			{
				field_type: "number",
				config: {
					name: "Count",
					api_accessor: "count",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const schema = specToZodSchema(fields, plugins);
		expect(schema.safeParse({ count: undefined }).success).toBe(true);
		expect(schema.safeParse({ count: "" }).success).toBe(false);
	});

	describe("composing child fields (#53)", () => {
		/** A container type as the plugin contract now allows one: it validates
		 * what it holds by composing its children, and falls back when it is
		 * handed no composer. */
		function containerPlugin(): FieldTypePlugin {
			return {
				...mockPlugin("container", z.unknown()),
				category: "structural",
				toZodType: (field, composeChildren) =>
					composeChildren && field.children
						? composeChildren(field.children)
						: z.record(z.unknown()),
			};
		}

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

		const container = (children: Field[] | null): Field => ({
			field_type: "container",
			config: {
				name: "Box",
				api_accessor: "box",
				required: false,
				instructions: "",
			},
			settings: null,
			children,
			system: false,
		});

		it("validates a container's children under its own accessor", () => {
			const schema = specToZodSchema(
				[container([child("street", true)])],
				[...plugins, containerPlugin()],
			);
			const result = schema.safeParse({ box: {} });
			expect(result.success).toBe(false);
			expect(result.error?.issues[0].path).toEqual(["box", "street"]);
		});

		it("leaves a plugin that ignores the second argument unchanged", () => {
			// The additive half of the contract: `text` here is the same
			// one-argument plugin every other test in this file uses, and having
			// children makes no difference to it.
			const schema = specToZodSchema(
				[{ ...child("name", true), children: [child("ignored", true)] }],
				plugins,
			);
			expect(schema.safeParse({ name: "John" }).success).toBe(true);
		});

		it("does not apply top-level overrides inside children", () => {
			// `overrides` is keyed by accessor and belongs to the Consumer's own
			// Fields — a Blueprint that happens to name a child the same must
			// not inherit it.
			const schema = specToZodSchema(
				[child("street", false), container([child("street", false)])],
				[...plugins, containerPlugin()],
				{ overrides: { street: () => z.literal("only at the top") } },
			);

			expect(schema.safeParse({ street: "nope", box: {} }).success).toBe(false);
			expect(
				schema.safeParse({ street: "only at the top", box: { street: "free" } })
					.success,
			).toBe(true);
		});

		it("hands no composer where there is nothing to compose with", () => {
			// A container whose children are absent still has to produce a type.
			const schema = specToZodSchema(
				[container(null)],
				[...plugins, containerPlugin()],
			);
			expect(schema.safeParse({ box: { anything: 1 } }).success).toBe(true);
		});
	});

	describe("optional constrained strings accept empty string (#38)", () => {
		const slugLike = mockPlugin(
			"slug",
			z.string().regex(/^[a-z0-9-]+$/, "invalid slug"),
		);
		const field = (required: boolean): Field => ({
			field_type: "slug",
			config: {
				name: "Slug",
				api_accessor: "slug",
				required,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		});

		it("optional: empty string passes despite the regex check", () => {
			const schema = specToZodSchema([field(false)], [slugLike]);
			expect(schema.safeParse({ slug: "" }).success).toBe(true);
		});

		it("optional: non-empty values still hit the regex", () => {
			const schema = specToZodSchema([field(false)], [slugLike]);
			expect(schema.safeParse({ slug: "valid-slug" }).success).toBe(true);
			expect(schema.safeParse({ slug: "Not Valid!" }).success).toBe(false);
		});

		it("required: empty string still fails", () => {
			const schema = specToZodSchema([field(true)], [slugLike]);
			expect(schema.safeParse({ slug: "" }).success).toBe(false);
		});
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

	it("should skip hidden fields even if they have a default_value", () => {
		const fields: Field[] = [
			{
				field_type: "text",
				config: {
					name: "Hidden Field",
					api_accessor: "hidden_field",
					required: false,
					instructions: "",
					hidden: true,
					default_value: "should be ignored",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "text",
				config: {
					name: "Visible Field",
					api_accessor: "visible_field",
					required: true,
					instructions: "",
					default_value: "kept",
				},
				settings: null,
				children: null,
				system: false,
			},
		];
		const defaults = getDefaultValues(fields);
		expect(defaults).not.toHaveProperty("hidden_field");
		expect(defaults).toEqual({ visible_field: "kept" });
	});

	describe("getDefaultValues with plugins (#38)", () => {
		const boolPlugin = mockPlugin("boolean", z.boolean(), () => false);
		const textPlugin = mockPlugin("text", z.string(), () => "");
		const noDefaultPlugin = mockPlugin("mystery", z.unknown());
		const mk = (
			type: string,
			accessor: string,
			extra?: Partial<Field["config"]>,
		): Field => ({
			field_type: type,
			config: {
				name: accessor,
				api_accessor: accessor,
				required: false,
				instructions: "",
				...extra,
			},
			settings: null,
			children: null,
			system: false,
		});

		it("stays sparse without plugins (back-compat)", () => {
			expect(getDefaultValues([mk("boolean", "flag")])).toEqual({});
		});

		it("seeds plugin defaults for visible fields", () => {
			const out = getDefaultValues(
				[mk("boolean", "flag"), mk("text", "title")],
				[boolPlugin, textPlugin],
			);
			expect(out).toEqual({ flag: false, title: "" });
		});

		it("explicit config.default_value wins over the plugin default", () => {
			const out = getDefaultValues(
				[mk("boolean", "flag", { default_value: true })],
				[boolPlugin],
			);
			expect(out).toEqual({ flag: true });
		});

		it("leaves fields of default-less plugins unseeded (key absent)", () => {
			const out = getDefaultValues([mk("mystery", "m")], [noDefaultPlugin]);
			expect("m" in out).toBe(false);
		});

		it("skips hidden and structural fields", () => {
			const out = getDefaultValues(
				[mk("boolean", "hiddenFlag", { hidden: true }), mk("section", "s")],
				[boolPlugin, mockPlugin("section", z.unknown(), () => "NEVER")],
			);
			expect(out).toEqual({});
		});

		it("composes a container's default from its children (#53)", () => {
			const containerPlugin: FieldTypePlugin = {
				...mockPlugin("container", z.unknown()),
				defaultValue: (field, composeChildren) =>
					composeChildren && field.children
						? composeChildren(field.children)
						: {},
			};
			const container: Field = {
				...mk("container", "box"),
				children: [mk("text", "street"), mk("boolean", "primary")],
			};

			expect(
				getDefaultValues(
					[container],
					[containerPlugin, textPlugin, boolPlugin],
				),
			).toEqual({ box: { street: "", primary: false } });
		});
	});
});
