// src/schema/__tests__/attribute-context.test.ts
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import { createRegistry } from "../registry";

/** The ids offered when an Author picks a type for an Attribute. */
function attributeTypes(): string[] {
	const registry = createRegistry();
	registry.registerAll(builtInFieldTypes);
	return registry.getByContext("attribute").map((plugin) => plugin.id);
}

describe("the attribute Field Context", () => {
	it("offers the ordinary leaf types, so an Attribute can be a number or a select", () => {
		const offered = attributeTypes();
		for (const id of [
			"text",
			"textarea",
			"number",
			"boolean",
			"date",
			"time",
			"select",
			"radio",
			"checkboxes",
			"url",
			"email",
		]) {
			expect(offered).toContain(id);
		}
	});

	it("offers no Marker — a drawer has no Tab and no Card to open", () => {
		const offered = attributeTypes();
		expect(offered).not.toContain("section");
		expect(offered).not.toContain("card");
	});

	it("offers no container — its children would be composed but never checked", () => {
		// ADR-0007: shared traversal walks `children` only, so nothing reaches a
		// Field nested in settings. A Fieldset here would never resolve, and a
		// Group's children would never have their Accessors checked.
		const offered = attributeTypes();
		expect(offered).not.toContain("group");
		expect(offered).not.toContain("fieldset");
		expect(offered).not.toContain("blocks");
	});

	it("offers no reference type — the recursion nothing would catch", () => {
		// Cycle rejection walks `children`, so a Reference Field declared as an
		// Attribute of a Reference Field is unbounded and unreported.
		const offered = attributeTypes();
		for (const plugin of builtInFieldTypes) {
			if (plugin.category !== "reference") continue;
			expect(offered).not.toContain(plugin.id);
		}
		expect(offered).not.toContain("reference");
		expect(offered).not.toContain("single_reference");
	});

	it("leaves the three incumbent contexts exactly as they were", () => {
		// The new context is additive: a plugin gaining "attribute" must not
		// change what any other context offers.
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);
		expect(registry.getByContext("blueprint").map((p) => p.id)).toContain(
			"virtual_table",
		);
		expect(registry.getByContext("form").map((p) => p.id)).toContain(
			"reference",
		);
		expect(registry.getByContext("task").map((p) => p.id)).not.toContain(
			"virtual_table",
		);
	});
});
