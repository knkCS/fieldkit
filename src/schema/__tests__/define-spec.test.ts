// src/schema/__tests__/define-spec.test.ts
import { describe, expect, it } from "vitest";
import { boolean, number, section, select, text } from "../builders";
import { defineSpec } from "../define-spec";

describe("defineSpec", () => {
	it("should produce a fields array from builder calls", () => {
		const spec = defineSpec([
			text("name", { required: true }),
			number("price"),
		]);
		expect(spec.fields).toHaveLength(2);
		expect(spec.fields[0].field_type).toBe("text");
		expect(spec.fields[0].config.api_accessor).toBe("name");
		expect(spec.fields[0].config.required).toBe(true);
		expect(spec.fields[1].field_type).toBe("number");
	});

	it("should set display name from api_accessor if not provided", () => {
		const spec = defineSpec([text("product_name")]);
		expect(spec.fields[0].config.name).toBe("product_name");
	});

	it("should allow explicit display name", () => {
		const spec = defineSpec([text("name", { name: "Product Name" })]);
		expect(spec.fields[0].config.name).toBe("Product Name");
	});

	it("should handle settings for field types", () => {
		const spec = defineSpec([
			text("title", { placeholder: "Enter title", prepend: "#" }),
		]);
		expect(spec.fields[0].settings).toEqual({
			placeholder: "Enter title",
			prepend: "#",
		});
	});

	it("should handle select with options", () => {
		const spec = defineSpec([
			select("status", { options: { draft: "Draft", published: "Published" } }),
		]);
		expect(spec.fields[0].settings).toEqual({
			options: { draft: "Draft", published: "Published" },
		});
	});

	it("should handle section with nested fields", () => {
		const spec = defineSpec([
			section("Basic Info", [text("name", { required: true }), number("age")]),
		]);
		expect(spec.fields).toHaveLength(3); // section + 2 fields flattened
		expect(spec.fields[0].field_type).toBe("section");
		expect(spec.fields[0].config.name).toBe("Basic Info");
	});

	it("should extract default values", () => {
		const spec = defineSpec([
			text("name", { default_value: "Untitled" }),
			boolean("active", { default_value: true }),
		]);
		expect(spec.defaultValues).toEqual({
			name: "Untitled",
			active: true,
		});
	});
});
