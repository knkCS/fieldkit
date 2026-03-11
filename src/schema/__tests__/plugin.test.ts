// src/schema/__tests__/plugin.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";

describe("FieldTypePlugin", () => {
	it("should define a valid plugin with all required fields", () => {
		const plugin: FieldTypePlugin<{ placeholder: string }> = {
			id: "text",
			name: "Text",
			description: "A single line of text",
			icon: () => null,
			category: "text",
			fieldComponent: () => null,
			toZodType: (field) => {
				let schema = z.string();
				if (field.config.required) {
					schema = schema.min(1, "Required");
				}
				return schema;
			},
			defaultSettings: { placeholder: "" },
			availableIn: ["blueprint", "task", "form"],
		};

		expect(plugin.id).toBe("text");
		expect(plugin.category).toBe("text");
	});

	it("should allow optional components", () => {
		const plugin: FieldTypePlugin = {
			id: "boolean",
			name: "Boolean",
			description: "True/false toggle",
			icon: () => null,
			category: "boolean",
			fieldComponent: () => null,
			toZodType: () => z.boolean(),
		};

		expect(plugin.settingsComponent).toBeUndefined();
		expect(plugin.cellComponent).toBeUndefined();
		expect(plugin.maxPerSpec).toBeUndefined();
	});

	it("should support maxPerSpec constraint", () => {
		const plugin: FieldTypePlugin = {
			id: "toc_reference",
			name: "TOC Reference",
			description: "Table of contents reference",
			icon: () => null,
			category: "reference",
			fieldComponent: () => null,
			toZodType: () => z.string(),
			maxPerSpec: 1,
		};

		expect(plugin.maxPerSpec).toBe(1);
	});
});
