import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { specToZodSchema } from "../../zod-builder";
import { urlPlugin } from "../url";

const createField = (overrides: Partial<Field["config"]> = {}): Field => ({
	field_type: "url",
	config: {
		name: "Website",
		api_accessor: "website",
		required: true,
		instructions: "",
		...overrides,
	},
	settings: null,
	children: null,
	system: false,
});

describe("urlPlugin", () => {
	it("should have correct metadata", () => {
		expect(urlPlugin.id).toBe("url");
		expect(urlPlugin.category).toBe("text");
	});

	it("should validate URL format when required", () => {
		const field = createField({ required: true });
		const zodType = urlPlugin.toZodType(field);
		expect(zodType.safeParse("https://example.com").success).toBe(true);
		expect(zodType.safeParse("not-a-url").success).toBe(false);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should always return url-validated string (optional handling delegated to zod-builder)", () => {
		const field = createField({ required: false });
		const zodType = urlPlugin.toZodType(field);
		// Plugin always validates format — empty string fails at plugin level
		expect(zodType.safeParse("https://example.com").success).toBe(true);
		expect(zodType.safeParse("not-a-url").success).toBe(false);
		expect(zodType.safeParse("").success).toBe(false); // Changed: empty string now fails
	});

	it("should allow empty string when optional via specToZodSchema", () => {
		const field = createField({ required: false });
		const schema = specToZodSchema([field], [urlPlugin]);
		expect(schema.safeParse({ [field.config.api_accessor]: "" }).success).toBe(
			true,
		);
		expect(
			schema.safeParse({ [field.config.api_accessor]: undefined }).success,
		).toBe(true);
	});
});
