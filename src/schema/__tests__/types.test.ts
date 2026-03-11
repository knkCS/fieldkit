// src/schema/__tests__/types.test.ts
import { describe, expect, it } from "vitest";
import type { Field, Schema } from "../types";

describe("Schema types", () => {
	it("should create a valid Field object", () => {
		const field: Field = {
			field_type: "text",
			config: {
				name: "Product Name",
				api_accessor: "product_name",
				required: true,
				instructions: "Enter the product name",
			},
			settings: { placeholder: "Enter name" },
			children: null,
			system: false,
		};

		expect(field.field_type).toBe("text");
		expect(field.config.api_accessor).toBe("product_name");
		expect(field.config.required).toBe(true);
	});

	it("should support optional FieldConfig extensions", () => {
		const field: Field = {
			field_type: "text",
			config: {
				name: "Email",
				api_accessor: "email",
				required: true,
				instructions: "",
				default_value: "user@example.com",
				unique: true,
				localizable: false,
				hidden: false,
				read_only: false,
				condition: {
					field: "has_email",
					operator: "eq",
					value: true,
				},
			},
			settings: null,
			children: null,
			system: false,
		};

		expect(field.config.default_value).toBe("user@example.com");
		expect(field.config.unique).toBe(true);
		expect(field.config.condition?.field).toBe("has_email");
	});

	it("should support FieldValidation", () => {
		const field: Field = {
			field_type: "text",
			config: {
				name: "Code",
				api_accessor: "code",
				required: false,
				instructions: "",
			},
			validation: {
				min_length: 3,
				max_length: 10,
				pattern: "^[A-Z]+$",
				pattern_message: "Only uppercase letters",
			},
			settings: null,
			children: null,
			system: false,
		};

		expect(field.validation?.min_length).toBe(3);
		expect(field.validation?.pattern).toBe("^[A-Z]+$");
	});

	it("should support nested children for structural types", () => {
		const field: Field = {
			field_type: "group",
			config: {
				name: "Authors",
				api_accessor: "authors",
				required: false,
				instructions: "",
			},
			settings: { min_items: 1, max_items: 5 },
			children: [
				{
					field_type: "text",
					config: {
						name: "Author Name",
						api_accessor: "name",
						required: true,
						instructions: "",
					},
					settings: null,
					children: null,
					system: false,
				},
			],
			system: false,
		};

		expect(field.children).toHaveLength(1);
		expect(field.children?.[0].config.api_accessor).toBe("name");
	});

	it("should accept Schema as Field array", () => {
		const schema: Schema = [
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

		expect(schema).toHaveLength(1);
	});
});
