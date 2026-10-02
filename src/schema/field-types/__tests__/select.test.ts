import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { SelectSettings } from "../select";
import { selectPlugin } from "../select";

describe("selectPlugin", () => {
	it("should have correct metadata", () => {
		expect(selectPlugin.id).toBe("select");
		expect(selectPlugin.category).toBe("selection");
	});

	it("should generate required single-select Zod type", () => {
		const field: Field<SelectSettings> = {
			field_type: "select",
			config: {
				name: "Status",
				api_accessor: "status",
				required: true,
				instructions: "",
			},
			settings: { options: { draft: "Draft", published: "Published" } },
			children: null,
			system: false,
		};
		const zodType = selectPlugin.toZodType(field);
		expect(zodType.safeParse("draft").success).toBe(true);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should generate optional single-select Zod type", () => {
		const field: Field<SelectSettings> = {
			field_type: "select",
			config: {
				name: "Status",
				api_accessor: "status",
				required: false,
				instructions: "",
			},
			settings: { options: { draft: "Draft", published: "Published" } },
			children: null,
			system: false,
		};
		const zodType = selectPlugin.toZodType(field);
		expect(zodType.safeParse("").success).toBe(true);
		expect(zodType.safeParse("draft").success).toBe(true);
	});

	it("should generate multiple-select Zod type", () => {
		const field: Field<SelectSettings> = {
			field_type: "select",
			config: {
				name: "Tags",
				api_accessor: "tags",
				required: false,
				instructions: "",
			},
			settings: { options: { a: "A", b: "B" }, multiple: true },
			children: null,
			system: false,
		};
		const zodType = selectPlugin.toZodType(field);
		expect(zodType.safeParse(["a", "b"]).success).toBe(true);
		expect(zodType.safeParse([]).success).toBe(true);
		expect(zodType.safeParse("a").success).toBe(false);
	});

	it("should generate required multiple-select Zod type with min(1)", () => {
		const field: Field<SelectSettings> = {
			field_type: "select",
			config: {
				name: "Tags",
				api_accessor: "tags",
				required: true,
				instructions: "",
			},
			settings: { options: { a: "A", b: "B" }, multiple: true },
			children: null,
			system: false,
		};
		const zodType = selectPlugin.toZodType(field);
		expect(zodType.safeParse(["a"]).success).toBe(true);
		expect(zodType.safeParse([]).success).toBe(false);
	});

	// A cleared BaseSelect holds `null` (#314): the same Unset as `""`
	// (ADR-0021), so it validates exactly as `""` does, message and all.
	it("reads a cleared single select's null as it reads an empty string", () => {
		const field = (required: boolean): Field<SelectSettings> => ({
			field_type: "select",
			config: {
				name: "Status",
				api_accessor: "status",
				required,
				instructions: "",
			},
			settings: { options: { draft: "Draft" } },
			children: null,
			system: false,
		});
		expect(selectPlugin.toZodType(field(false)).safeParse(null).success).toBe(
			true,
		);
		const required = selectPlugin.toZodType(field(true)).safeParse(null);
		expect(required.success).toBe(false);
		expect(required.error?.issues[0]?.message).toBe("Status is required");
		expect(selectPlugin.toZodType(field(false)).safeParse(1).success).toBe(
			false,
		);
	});
});
