import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { specToZodSchema } from "../../zod-builder";
import { emailPlugin } from "../email";

const createField = (overrides: Partial<Field["config"]> = {}): Field => ({
	field_type: "email",
	config: {
		name: "Email",
		api_accessor: "email",
		required: true,
		instructions: "",
		...overrides,
	},
	settings: null,
	children: null,
	system: false,
});

describe("emailPlugin", () => {
	it("should have correct metadata", () => {
		expect(emailPlugin.id).toBe("email");
		expect(emailPlugin.category).toBe("text");
	});

	it("should validate email format when required", () => {
		const field = createField({ required: true });
		const zodType = emailPlugin.toZodType(field);
		expect(zodType.safeParse("user@example.com").success).toBe(true);
		expect(zodType.safeParse("not-an-email").success).toBe(false);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should always return email-validated string (optional handling delegated to zod-builder)", () => {
		const field = createField({ required: false });
		const zodType = emailPlugin.toZodType(field);
		// Plugin always validates format — empty string fails at plugin level
		expect(zodType.safeParse("valid@email.com").success).toBe(true);
		expect(zodType.safeParse("not-email").success).toBe(false);
		expect(zodType.safeParse("").success).toBe(false); // Changed: empty string now fails
	});

	it("should allow empty string when optional via specToZodSchema", () => {
		const field = createField({ required: false });
		const schema = specToZodSchema([field], [emailPlugin]);
		expect(schema.safeParse({ [field.config.api_accessor]: "" }).success).toBe(
			true,
		);
		expect(
			schema.safeParse({ [field.config.api_accessor]: undefined }).success,
		).toBe(true);
	});
});
