import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { emailPlugin } from "../email";

describe("emailPlugin", () => {
	it("should have correct metadata", () => {
		expect(emailPlugin.id).toBe("email");
		expect(emailPlugin.category).toBe("text");
	});

	it("should validate email format when required", () => {
		const field: Field = {
			field_type: "email",
			config: {
				name: "Email",
				api_accessor: "email",
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = emailPlugin.toZodType(field);
		expect(zodType.safeParse("user@example.com").success).toBe(true);
		expect(zodType.safeParse("not-an-email").success).toBe(false);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should allow empty string when optional", () => {
		const field: Field = {
			field_type: "email",
			config: {
				name: "Email",
				api_accessor: "email",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = emailPlugin.toZodType(field);
		expect(zodType.safeParse("").success).toBe(true);
		expect(zodType.safeParse("user@example.com").success).toBe(true);
		expect(zodType.safeParse("not-an-email").success).toBe(false);
	});
});
