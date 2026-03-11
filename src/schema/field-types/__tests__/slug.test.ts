import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { slugPlugin } from "../slug";

describe("slugPlugin", () => {
	it("should have correct metadata", () => {
		expect(slugPlugin.id).toBe("slug");
		expect(slugPlugin.category).toBe("text");
	});

	it("should validate slug format", () => {
		const field: Field = {
			field_type: "slug",
			config: {
				name: "Slug",
				api_accessor: "slug",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = slugPlugin.toZodType(field);
		expect(zodType.safeParse("hello-world").success).toBe(true);
		expect(zodType.safeParse("my-post-123").success).toBe(true);
		expect(zodType.safeParse("simple").success).toBe(true);
		expect(zodType.safeParse("").success).toBe(true);
		expect(zodType.safeParse("Hello-World").success).toBe(false);
		expect(zodType.safeParse("hello world").success).toBe(false);
		expect(zodType.safeParse("hello--world").success).toBe(false);
		expect(zodType.safeParse("-hello").success).toBe(false);
	});

	it("should require non-empty value when required", () => {
		const field: Field = {
			field_type: "slug",
			config: {
				name: "Slug",
				api_accessor: "slug",
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = slugPlugin.toZodType(field);
		expect(zodType.safeParse("valid-slug").success).toBe(true);
		// When required, empty string should fail (goes through min(1) first, then regex check)
		expect(zodType.safeParse("").success).toBe(false);
	});
});
