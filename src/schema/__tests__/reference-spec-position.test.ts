// src/schema/__tests__/reference-spec-position.test.ts
//
// The Reference Spec as a Position (ADR-0022): what used to be the
// `attribute` Field Context is `reference_spec`, declared by each type and
// enforced by `validateSpec()` rather than only narrowing a picker.
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import { createRegistry } from "../registry";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";

/** The ids a Field in a Reference Spec may be. */
function referenceSpecTypes(): string[] {
	const registry = createRegistry();
	registry.registerAll(builtInFieldTypes);
	return registry.getByPosition("reference_spec").map((plugin) => plugin.id);
}

describe("the reference_spec Position", () => {
	it("admits the ordinary leaf types, so an Attribute can be a number or a select", () => {
		const offered = referenceSpecTypes();
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

	it("admits no Marker — a drawer has no Tab and no Card to open", () => {
		const offered = referenceSpecTypes();
		expect(offered).not.toContain("section");
		expect(offered).not.toContain("card");
	});

	it("admits no container — a Fieldset there would never resolve", () => {
		const offered = referenceSpecTypes();
		expect(offered).not.toContain("group");
		expect(offered).not.toContain("fieldset");
		expect(offered).not.toContain("blocks");
		expect(offered).not.toContain("virtual_table");
	});

	it("admits no reference type — the recursion nothing would catch", () => {
		const offered = referenceSpecTypes();
		for (const plugin of builtInFieldTypes) {
			if (plugin.category !== "reference") continue;
			expect(offered).not.toContain(plugin.id);
		}
		expect(offered).not.toContain("reference");
		expect(offered).not.toContain("single_reference");
	});

	it("is exactly the set the attribute Field Context offered", () => {
		// ADR-0022 moved the rule, not its contents: every type that listed
		// `attribute` in `availableIn` lists `reference_spec`, and no other.
		expect(referenceSpecTypes().sort()).toEqual(
			[
				"array",
				"boolean",
				"checkboxes",
				"code",
				"color",
				"date",
				"email",
				"list",
				"lookup",
				"markdown",
				"media",
				"number",
				"radio",
				"rich_text",
				"select",
				"slug",
				"text",
				"textarea",
				"time",
				"url",
			].sort(),
		);
	});

	it("leaves the Consumers' pickers exactly as they were", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);
		for (const consumer of ["blueprint", "task", "form"] as const) {
			expect(
				registry
					.getByConsumer(consumer)
					.map((p) => p.id)
					.sort(),
			).toEqual(builtInFieldTypes.map((p) => p.id).sort());
		}
	});
});

function field(
	fieldType: string,
	accessor: string,
	extra: Partial<Field> = {},
): Field {
	return {
		field_type: fieldType,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		system: false,
		...extra,
	};
}

const plugins = new Map<string, FieldTypePlugin>(
	builtInFieldTypes.map((plugin) => [plugin.id, plugin]),
);

describe("validateSpec over a Reference Spec", () => {
	it("reports a Field whose type may not sit in a Reference Spec as position", () => {
		const credits = field("reference", "credits", {
			settings: {
				attributes: [
					field("text", "role"),
					field("section", "divider"),
					field("group", "details", { children: [field("text", "note")] }),
					field("reference", "nested"),
				],
			},
		});
		const errors = validateSpec([credits], plugins).fieldErrors;
		expect(
			errors
				.filter((e) => e.code === "position")
				.map((e) => [e.path, e.params?.position]),
		).toEqual([
			["/credits/settings/attributes/divider", "reference_spec"],
			["/credits/settings/attributes/details", "reference_spec"],
			["/credits/settings/attributes/nested", "reference_spec"],
		]);
	});

	it("walks it like children, so an Attribute's Accessor is checked too", () => {
		const credits = field("reference", "credits", {
			settings: {
				attributes: [
					field("text", "role"),
					field("text", "role"),
					field("text", "_id"),
				],
			},
		});
		const errors = validateSpec([credits], plugins).fieldErrors;
		expect(errors.map((e) => [e.code, e.path])).toEqual(
			expect.arrayContaining([
				["duplicate_accessor", "/credits/settings/attributes/role"],
				["reserved_accessor", "/credits/settings/attributes/_id"],
			]),
		);
	});

	it("accepts a Reference Spec of leaf types", () => {
		const credits = field("reference", "credits", {
			settings: {
				attributes: [field("text", "role"), field("number", "page")],
			},
		});
		expect(validateSpec([credits], plugins).fieldErrors).toEqual([]);
	});
});
