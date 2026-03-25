import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { specToZodSchema } from "../../zod-builder";
import { slugPlugin } from "../slug";

const createField = (overrides: Partial<Field["config"]> = {}): Field => ({
	field_type: "slug",
	config: {
		name: "Slug",
		api_accessor: "slug",
		required: true,
		instructions: "",
		...overrides,
	},
	settings: null,
	children: null,
	system: false,
});

describe("slugPlugin", () => {
	it("should have correct metadata", () => {
		expect(slugPlugin.id).toBe("slug");
		expect(slugPlugin.category).toBe("text");
	});

	it("should validate slug format when required", () => {
		const field = createField({ required: true });
		const zodType = slugPlugin.toZodType(field);
		expect(zodType.safeParse("hello-world").success).toBe(true);
		expect(zodType.safeParse("my-post-123").success).toBe(true);
		expect(zodType.safeParse("simple").success).toBe(true);
		expect(zodType.safeParse("").success).toBe(false);
		expect(zodType.safeParse("Hello-World").success).toBe(false);
		expect(zodType.safeParse("hello world").success).toBe(false);
		expect(zodType.safeParse("hello--world").success).toBe(false);
		expect(zodType.safeParse("-hello").success).toBe(false);
	});

	it("should always return slug-validated string (optional handling delegated to zod-builder)", () => {
		const field = createField({ required: false });
		const zodType = slugPlugin.toZodType(field);
		// Plugin always validates format — empty string fails at plugin level
		expect(zodType.safeParse("valid-slug").success).toBe(true);
		expect(zodType.safeParse("Hello-World").success).toBe(false);
		expect(zodType.safeParse("").success).toBe(false); // Changed: empty string now fails
	});

	it("should allow empty string when optional via specToZodSchema", () => {
		const field = createField({ required: false });
		const schema = specToZodSchema([field], [slugPlugin]);
		expect(schema.safeParse({ [field.config.api_accessor]: "" }).success).toBe(
			true,
		);
		expect(
			schema.safeParse({ [field.config.api_accessor]: undefined }).success,
		).toBe(true);
	});
});
