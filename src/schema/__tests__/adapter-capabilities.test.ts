// src/schema/__tests__/adapter-capabilities.test.ts
import { describe, expect, it } from "vitest";
import {
	hasAdapterCapability,
	servedByAdapters,
} from "../adapter-capabilities";
import { builtInFieldTypes } from "../field-types";
import { createReferencePlugin } from "../field-types/reference";
import type { FieldTypePlugin } from "../plugin";

const search = async () => ({ items: [] });

const plugin = (id: string) =>
	builtInFieldTypes.find((p) => p.id === id) as FieldTypePlugin;

describe("hasAdapterCapability", () => {
	it("needs the Adapter AND its search", () => {
		expect(hasAdapterCapability({}, "blueprint.search")).toBe(false);
		expect(hasAdapterCapability({ blueprint: {} }, "blueprint.search")).toBe(
			false,
		);
		expect(
			hasAdapterCapability({ blueprint: { search } }, "blueprint.search"),
		).toBe(true);
		expect(
			hasAdapterCapability({ blueprint: { search } }, "textType.search"),
		).toBe(false);
		expect(
			hasAdapterCapability({ textType: { search } }, "textType.search"),
		).toBe(true);
	});
});

describe("the built-in types' requirements", () => {
	it.each([
		["reference", "blueprint.search"],
		["single_reference", "blueprint.search"],
		["fieldset", "blueprint.search"],
		["rich_text", "textType.search"],
	])("%s requires %s", (id, capability) => {
		expect(plugin(id).requiresAdapters).toEqual([capability]);
	});

	it("a minted reference type requires a Blueprint search too", () => {
		const minted = createReferencePlugin({ id: "related", name: "Related" });
		expect(servedByAdapters(minted, {})).toBe(false);
		expect(servedByAdapters(minted, { blueprint: { search } })).toBe(true);
	});

	it("every other built-in type needs nothing", () => {
		const needing = builtInFieldTypes
			.filter((p) => !servedByAdapters(p, {}))
			.map((p) => p.id)
			.sort();
		expect(needing).toEqual(
			["fieldset", "reference", "rich_text", "single_reference"].sort(),
		);
	});
});
