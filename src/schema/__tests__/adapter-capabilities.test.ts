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

/** Every Adapter, each with what its capability reads: the Consumer
 * blueprinthub and contenthub are. */
const ALL_ADAPTERS = {
	blueprint: { search },
	textType: { search },
	reference: { search },
	media: { upload: async () => ({}) },
	lookup: { printer: { search } },
};

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

describe("a capability a value needs (ADR-0027, amended: by value)", () => {
	it("names reference.search, media and lookup among the capabilities", () => {
		for (const capability of ["reference.search", "media", "lookup"] as const) {
			expect(ADAPTER_CAPABILITIES).toContain(capability);
		}
	});

	it("reference.search needs the reference Adapter AND its search", () => {
		expect(hasAdapterCapability({}, "reference.search")).toBe(false);
		expect(hasAdapterCapability({ reference: {} }, "reference.search")).toBe(
			false,
		);
		expect(
			hasAdapterCapability({ reference: { search } }, "reference.search"),
		).toBe(true);
		// A Blueprint search is no Content source.
		expect(
			hasAdapterCapability({ blueprint: { search } }, "reference.search"),
		).toBe(false);
	});

	it("media needs the media Adapter's upload", () => {
		expect(hasAdapterCapability({}, "media")).toBe(false);
		expect(hasAdapterCapability({ media: {} }, "media")).toBe(false);
		expect(hasAdapterCapability({ media: { upload: search } }, "media")).toBe(
			true,
		);
	});

	it("lookup needs at least one Source that searches", () => {
		expect(hasAdapterCapability({}, "lookup")).toBe(false);
		expect(hasAdapterCapability({ lookup: {} }, "lookup")).toBe(false);
		expect(hasAdapterCapability({ lookup: { printer: {} } }, "lookup")).toBe(
			false,
		);
		expect(
			hasAdapterCapability({ lookup: { printer: { search } } }, "lookup"),
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
		["reference", ["blueprint.search:reference_target", "reference.search"]],
		[
			"single_reference",
			["blueprint.search:reference_target", "reference.search"],
		],
		["fieldset", ["blueprint.search:fieldset"]],
		["rich_text", ["textType.search"]],
		["media", ["media"]],
		["lookup", ["lookup"]],
	])("%s requires %j", (id, capabilities) => {
		expect(plugin(id).requiresAdapters).toEqual(capabilities);
	});

	it("a minted reference type requires a Blueprint and a Content search too", () => {
		const minted = createReferencePlugin({ id: "related", name: "Related" });
		expect(servedByAdapters(minted, {})).toBe(false);
		expect(servedByAdapters(minted, { blueprint: { search } })).toBe(false);
		expect(servedByAdapters(minted, { reference: { search } })).toBe(false);
		expect(
			servedByAdapters(minted, {
				blueprint: { search },
				reference: { search },
			}),
		).toBe(true);
	});

	const hiddenWith = (adapters: Parameters<typeof servedByAdapters>[1]) =>
		builtInFieldTypes
			.filter((p) => !servedByAdapters(p, adapters))
			.map((p) => p.id)
			.sort();

	it("every other built-in type needs nothing", () => {
		expect(hiddenWith({})).toEqual(
			[
				"fieldset",
				"lookup",
				"media",
				"reference",
				"rich_text",
				"single_reference",
			].sort(),
		);
	});

	it("every Adapter serves every built-in type: blueprinthub and contenthub", () => {
		expect(hiddenWith(ALL_ADAPTERS)).toEqual([]);
	});

	it("a Blueprint search without a reference Adapter hides the reference types", () => {
		// What #356 found: a Consumer with `blueprint.search` and no Content
		// source was offered a Reference nobody filling in the form could fill.
		const { reference: _reference, ...adapters } = ALL_ADAPTERS;
		expect(hiddenWith(adapters)).toEqual(["reference", "single_reference"]);
	});

	it("no media Adapter hides media, and no Source hides lookup", () => {
		const { media: _media, ...noMedia } = ALL_ADAPTERS;
		expect(hiddenWith(noMedia)).toEqual(["media"]);
		expect(hiddenWith({ ...ALL_ADAPTERS, lookup: {} })).toEqual(["lookup"]);
	});

	it("a Blueprint search with no purposes declared serves what it always did", () => {
		expect(hiddenWith(ALL_ADAPTERS)).toEqual([]);
		expect(hiddenWith({ ...ALL_ADAPTERS, blueprint: { search } })).toEqual([]);
	});

	it("a Blueprint search for reference targets only hides the Fieldset", () => {
		expect(
			hiddenWith({
				...ALL_ADAPTERS,
				blueprint: { search, purposes: ["reference_target"] },
			}),
		).toEqual(["fieldset"]);
	});

	it("a Blueprint search for Fieldsets only hides the reference types", () => {
		expect(
			hiddenWith({
				...ALL_ADAPTERS,
				blueprint: { search, purposes: ["fieldset"] },
			}),
		).toEqual(["reference", "single_reference"]);
	});

	it("a Blueprint search declaring no purpose at all serves none", () => {
		expect(
			hiddenWith({ ...ALL_ADAPTERS, blueprint: { search, purposes: [] } }),
		).toEqual(["fieldset", "reference", "single_reference"].sort());
	});

	it("a minted reference type follows the reference_target purpose", () => {
		const minted = createReferencePlugin({ id: "related", name: "Related" });
		expect(
			servedByAdapters(minted, {
				reference: { search },
				blueprint: { search, purposes: ["reference_target"] },
			}),
		).toBe(true);
		expect(
			servedByAdapters(minted, {
				reference: { search },
				blueprint: { search, purposes: ["fieldset"] },
			}),
		).toBe(false);
	});
});
