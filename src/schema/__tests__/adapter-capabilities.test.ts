// src/schema/__tests__/adapter-capabilities.test.ts
import { describe, expect, it } from "vitest";
import {
	ADAPTER_CAPABILITIES,
	BLUEPRINT_PURPOSES,
	blueprintSearchFor,
	declinesBlueprintPurpose,
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

describe("a Blueprint capability for a purpose (ADR-0027, amended)", () => {
	const purposeCapabilities = BLUEPRINT_PURPOSES.map(blueprintSearchFor);

	it("names every purpose among the capabilities", () => {
		expect(purposeCapabilities).toEqual([
			"blueprint.search:reference_target",
			"blueprint.search:fieldset",
			"blueprint.search:row_spec",
		]);
		for (const capability of purposeCapabilities) {
			expect(ADAPTER_CAPABILITIES).toContain(capability);
		}
	});

	it("holds for every purpose when the Adapter declares no purposes", () => {
		for (const capability of purposeCapabilities) {
			expect(hasAdapterCapability({ blueprint: { search } }, capability)).toBe(
				true,
			);
		}
	});

	it("holds only for the purposes the Adapter declares", () => {
		const adapters = {
			blueprint: { search, purposes: ["reference_target"] as const },
		};
		expect(
			hasAdapterCapability(adapters, "blueprint.search:reference_target"),
		).toBe(true);
		expect(hasAdapterCapability(adapters, "blueprint.search:fieldset")).toBe(
			false,
		);
		expect(hasAdapterCapability(adapters, "blueprint.search:row_spec")).toBe(
			false,
		);
		// The bare capability asks only that the Adapter searches.
		expect(hasAdapterCapability(adapters, "blueprint.search")).toBe(true);
	});

	it("never holds without a search, whatever the purposes say", () => {
		const adapters = { blueprint: { purposes: ["fieldset"] } };
		for (const capability of purposeCapabilities) {
			expect(hasAdapterCapability(adapters, capability)).toBe(false);
		}
	});

	it("tells a declined purpose from a missing source", () => {
		expect(declinesBlueprintPurpose({}, "fieldset")).toBe(false);
		expect(
			declinesBlueprintPurpose(
				{ blueprint: { purposes: ["reference_target"] } },
				"fieldset",
			),
		).toBe(false);
		expect(
			declinesBlueprintPurpose({ blueprint: { search } }, "fieldset"),
		).toBe(false);
		const scoped = {
			blueprint: { search, purposes: ["reference_target"] },
		};
		expect(declinesBlueprintPurpose(scoped, "fieldset")).toBe(true);
		expect(declinesBlueprintPurpose(scoped, "row_spec")).toBe(true);
		expect(declinesBlueprintPurpose(scoped, "reference_target")).toBe(false);
	});
});

describe("the built-in types' requirements", () => {
	it.each([
		["reference", "blueprint.search:reference_target"],
		["single_reference", "blueprint.search:reference_target"],
		["fieldset", "blueprint.search:fieldset"],
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

	const hiddenWith = (adapters: Parameters<typeof servedByAdapters>[1]) =>
		builtInFieldTypes
			.filter((p) => !servedByAdapters(p, adapters))
			.map((p) => p.id)
			.sort();

	it("a Blueprint search with no purposes declared serves what it always did", () => {
		expect(hiddenWith({ blueprint: { search } })).toEqual(["rich_text"]);
	});

	it("a Blueprint search for reference targets only hides the Fieldset", () => {
		expect(
			hiddenWith({ blueprint: { search, purposes: ["reference_target"] } }),
		).toEqual(["fieldset", "rich_text"]);
	});

	it("a Blueprint search for Fieldsets only hides the reference types", () => {
		expect(
			hiddenWith({ blueprint: { search, purposes: ["fieldset"] } }),
		).toEqual(["reference", "rich_text", "single_reference"]);
	});

	it("a Blueprint search declaring no purpose at all serves none", () => {
		expect(hiddenWith({ blueprint: { search, purposes: [] } })).toEqual(
			["fieldset", "reference", "rich_text", "single_reference"].sort(),
		);
	});

	it("a minted reference type follows the reference_target purpose", () => {
		const minted = createReferencePlugin({ id: "related", name: "Related" });
		expect(
			servedByAdapters(minted, {
				blueprint: { search, purposes: ["reference_target"] },
			}),
		).toBe(true);
		expect(
			servedByAdapters(minted, {
				blueprint: { search, purposes: ["fieldset"] },
			}),
		).toBe(false);
	});
});
