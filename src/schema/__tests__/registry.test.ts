// src/schema/__tests__/registry.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import { createRegistry } from "../registry";

function mockPlugin(
	id: string,
	overrides?: Partial<FieldTypePlugin>,
): FieldTypePlugin {
	return {
		id,
		name: id,
		description: `${id} field`,
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => z.string(),
		...overrides,
	};
}

describe("Plugin Registry", () => {
	let registry: ReturnType<typeof createRegistry>;

	beforeEach(() => {
		registry = createRegistry();
	});

	it("should register and retrieve a plugin", () => {
		const plugin = mockPlugin("text");
		registry.register(plugin);
		expect(registry.get("text")).toBe(plugin);
	});

	it("should return undefined for unregistered plugin", () => {
		expect(registry.get("unknown")).toBeUndefined();
	});

	it("should list all registered plugins", () => {
		registry.register(mockPlugin("text"));
		registry.register(mockPlugin("number"));
		expect(registry.getAll()).toHaveLength(2);
	});

	it("should filter plugins by category", () => {
		registry.register(mockPlugin("text", { category: "text" }));
		registry.register(mockPlugin("number", { category: "number" }));
		registry.register(mockPlugin("textarea", { category: "text" }));
		const textPlugins = registry.getByCategory("text");
		expect(textPlugins).toHaveLength(2);
		expect(textPlugins.map((p) => p.id)).toEqual(["text", "textarea"]);
	});

	it("should filter plugins by context", () => {
		registry.register(
			mockPlugin("text", { availableIn: ["blueprint", "task", "form"] }),
		);
		registry.register(mockPlugin("reference", { availableIn: ["blueprint"] }));
		const taskPlugins = registry.getByContext("task");
		expect(taskPlugins).toHaveLength(1);
		expect(taskPlugins[0].id).toBe("text");
	});

	it("should include plugins with no availableIn filter in all contexts", () => {
		registry.register(mockPlugin("text"));
		expect(registry.getByContext("blueprint")).toHaveLength(1);
		expect(registry.getByContext("task")).toHaveLength(1);
		expect(registry.getByContext("form")).toHaveLength(1);
	});

	it("should throw when registering duplicate ID", () => {
		registry.register(mockPlugin("text"));
		expect(() => registry.register(mockPlugin("text"))).toThrow(
			'Field type "text" is already registered',
		);
	});

	it("should register multiple plugins at once", () => {
		registry.registerAll([mockPlugin("text"), mockPlugin("number")]);
		expect(registry.getAll()).toHaveLength(2);
	});
});
