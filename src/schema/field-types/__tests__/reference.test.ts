import { BookOpen } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { FieldTypePlugin } from "../../plugin";
import type { Field } from "../../types";
import { validateSpec } from "../../validate-spec";
import type { ReferencePluginOptions, ReferenceSettings } from "../reference";
import { createReferencePlugin, referencePlugin } from "../reference";

function makeField(
	overrides: { required?: boolean; settings?: ReferenceSettings | null } = {},
): Field<ReferenceSettings> {
	return {
		field_type: "reference",
		config: {
			name: "Related articles",
			api_accessor: "related",
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: overrides.settings === undefined ? {} : overrides.settings,
		children: null,
		system: false,
	};
}

describe("referencePlugin", () => {
	it("should have correct metadata", () => {
		expect(referencePlugin.id).toBe("reference");
		expect(referencePlugin.category).toBe("reference");
	});

	it("holds an array of References, never a bare id", () => {
		const zodType = referencePlugin.toZodType(makeField());

		expect(zodType.safeParse([{ id: "article-1" }]).success).toBe(true);
		expect(zodType.safeParse(["article-1"]).success).toBe(false);
		expect(zodType.safeParse({ id: "article-1" }).success).toBe(false);
	});

	it("accepts the parts of a Reference later tickets fill in", () => {
		const zodType = referencePlugin.toZodType(makeField());

		expect(
			zodType.safeParse([
				{ id: "article-1", pin: "v3", attributes: { page: "12" } },
			]).success,
		).toBe(true);
	});

	it("keeps a nested branch rather than parsing it away", () => {
		// The tree is genuinely nested (ADR-0008), and an object schema that
		// did not name `children` would strip it — a drag would then nest a
		// Reference on screen and submit a flat list.
		const zodType = referencePlugin.toZodType(makeField());
		const tree = [
			{ id: "a", children: [{ id: "a1", children: [{ id: "a1x" }] }] },
			{ id: "b" },
		];

		const parsed = zodType.safeParse(tree);
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data).toEqual(tree);
	});

	it("holds a nested Reference to the same rules as a root one", () => {
		const zodType = referencePlugin.toZodType(makeField());

		expect(
			zodType.safeParse([{ id: "a", children: [{ id: "" }] }]).success,
		).toBe(false);
		expect(zodType.safeParse([{ id: "a", children: ["a1"] }]).success).toBe(
			false,
		);
	});

	it("keeps its array shape whatever max_items says", () => {
		// ADR-0005: incompatible value shapes must not hide behind one
		// field_type. `max_items: 1` is a cap, not a second shape — Single
		// Reference is its own Field Type.
		const zodType = referencePlugin.toZodType(
			makeField({ settings: { max_items: 1 } }),
		);

		expect(zodType.safeParse([{ id: "article-1" }]).success).toBe(true);
		expect(zodType.safeParse("article-1").success).toBe(false);
	});

	it("treats an empty list as empty when required", () => {
		const zodType = referencePlugin.toZodType(makeField({ required: true }));

		expect(zodType.safeParse([{ id: "article-1" }]).success).toBe(true);

		const empty = zodType.safeParse([]);
		expect(empty.success).toBe(false);
		expect(!empty.success && empty.error.issues[0].message).toBe(
			"Related articles is required",
		);
	});

	it("allows an empty list when not required", () => {
		expect(referencePlugin.toZodType(makeField()).safeParse([]).success).toBe(
			true,
		);
	});

	it("rejects a Reference with no id", () => {
		const zodType = referencePlugin.toZodType(makeField());

		expect(zodType.safeParse([{ id: "" }]).success).toBe(false);
		expect(zodType.safeParse([{}]).success).toBe(false);
	});

	it("seeds an empty list, so the control renders before anything is picked", () => {
		expect(referencePlugin.defaultValue?.(makeField())).toEqual([]);
	});

	it("offers a settings editor for the Field", () => {
		expect(referencePlugin.settingsComponent).toBeDefined();
	});

	it("starts a new Field on the newest Version rather than pinning", () => {
		expect(referencePlugin.defaultSettings).toEqual({
			blueprints: [],
			pin_mode: "none",
		});
	});

	it("carries no always_latest, which pin_mode superseded", () => {
		// It drove no behaviour anywhere and was removed rather than
		// reimplemented (ADR-0008): `pin_mode: "none"` is what it meant.
		expect(referencePlugin.defaultSettings).not.toHaveProperty("always_latest");
	});

	it("stores a Pin as a bare target id", () => {
		const zodType = referencePlugin.toZodType(makeField());

		// Nothing about which *kind* of target it is: only the Field's
		// `pin_mode` says (ADR-0008).
		expect(zodType.safeParse([{ id: "a", pin: "r-1" }]).success).toBe(true);
		// And no Pin at all is just as valid — that is the newest Version.
		expect(zodType.safeParse([{ id: "a" }]).success).toBe(true);
		expect(zodType.safeParse([{ id: "a", pin: null }]).success).toBe(true);
	});
});

/**
 * The Consumer's own reference-shaped type, minted the way ADR-0010 says core
 * mints `toc_reference`: an id, a name, an icon and a cap. Everything else —
 * the tree, the Schema, the cell, the settings editor — comes from fieldkit,
 * and `referencePlugin` above is minted by the same call.
 */
function tocReference(overrides: Partial<ReferencePluginOptions> = {}) {
	return createReferencePlugin({
		id: "toc_reference",
		name: "TOC Reference",
		description: "The publication tree this Content hangs in",
		icon: BookOpen,
		maxPerSpec: 1,
		availableIn: ["blueprint"],
		...overrides,
	});
}

function mintedField(
	plugin: FieldTypePlugin<ReferenceSettings>,
	overrides: { accessor?: string; required?: boolean } = {},
): Field<ReferenceSettings> {
	return {
		field_type: plugin.id,
		config: {
			name: "Table of contents",
			api_accessor: overrides.accessor ?? "toc",
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
	};
}

describe("createReferencePlugin", () => {
	describe("what the Consumer says", () => {
		it("carries the identity, the cap and the contexts it was given", () => {
			const plugin = tocReference();

			expect(plugin.id).toBe("toc_reference");
			expect(plugin.name).toBe("TOC Reference");
			expect(plugin.description).toBe(
				"The publication tree this Content hangs in",
			);
			expect(plugin.icon).toBe(BookOpen);
			expect(plugin.maxPerSpec).toBe(1);
			expect(plugin.availableIn).toEqual(["blueprint"]);
		});

		it("needs nothing but an id and a name", () => {
			const plugin = createReferencePlugin({ id: "custom", name: "Custom" });

			expect(plugin.category).toBe("reference");
			expect(plugin.description).not.toBe("");
			expect(plugin.icon).toBeDefined();
			// Nothing defaults a cap in: `reference` has none, and neither does a
			// minted type that did not ask for one.
			expect(plugin.maxPerSpec).toBeUndefined();
			expect(plugin.availableIn).toEqual(["blueprint", "task", "form"]);
		});

		it("merges the Consumer's default settings over the reference defaults", () => {
			const plugin = tocReference({ defaultSettings: { max_depth: 3 } });

			expect(plugin.defaultSettings).toEqual({
				blueprints: [],
				pin_mode: "none",
				max_depth: 3,
			});
		});

		it("gives every minted plugin its own settings object", () => {
			const one = tocReference();
			const other = createReferencePlugin({ id: "other", name: "Other" });

			expect(one.defaultSettings).not.toBe(other.defaultSettings);
			expect(one.defaultSettings?.blueprints).not.toBe(
				other.defaultSettings?.blueprints,
			);
		});
	});

	describe("what fieldkit brings", () => {
		it("brings the tree Field, the count cell and the reference settings editor", () => {
			const plugin = tocReference();

			expect(plugin.fieldComponent).toBe(referencePlugin.fieldComponent);
			expect(plugin.cellComponent).toBe(referencePlugin.cellComponent);
			expect(plugin.settingsComponent).toBe(referencePlugin.settingsComponent);
		});

		it("generates the Reference Tree Schema, nested branches included", () => {
			const plugin = tocReference();
			const value = [
				{ id: "a", children: [{ id: "b", children: [{ id: "c" }] }] },
			];

			expect(plugin.toZodType(mintedField(plugin)).parse(value)).toEqual(value);
		});

		it("rejects an entry that is not a Reference", () => {
			const plugin = tocReference();

			expect(() =>
				plugin.toZodType(mintedField(plugin)).parse(["a-bare-id"]),
			).toThrow();
		});

		it("blocks an empty tree when the Field is required", () => {
			const plugin = tocReference();
			const schema = plugin.toZodType(mintedField(plugin, { required: true }));

			expect(() => schema.parse([])).toThrow(/Table of contents is required/);
			expect(schema.parse([{ id: "a" }])).toEqual([{ id: "a" }]);
		});

		it("seeds a fresh empty tree per form", () => {
			const plugin = tocReference();
			const first = plugin.defaultValue?.(mintedField(plugin));
			const second = plugin.defaultValue?.(mintedField(plugin));

			expect(first).toEqual([]);
			expect(first).not.toBe(second);
		});
	});

	// `toc_reference` took `maxPerSpec`'s only in-tree user with it (ADR-0010),
	// so the cap is kept honest by tests and by Consumer plugins alone. The
	// editor's half of that is in `editor/__tests__/consumer-reference-plugin`.
	describe("maxPerSpec, for a Consumer-registered plugin", () => {
		it("reports a second instance of a capped type", () => {
			const plugin = tocReference();
			const plugins = new Map<string, FieldTypePlugin>([[plugin.id, plugin]]);
			const result = validateSpec(
				[
					mintedField(plugin, { accessor: "toc" }),
					mintedField(plugin, { accessor: "toc_2" }),
				],
				plugins,
			);

			expect(result.valid).toBe(false);
			expect(result.errors.join("\n")).toContain("TOC Reference");
			expect(result.errors.join("\n")).toContain("limited to 1");
		});

		it("allows exactly one", () => {
			const plugin = tocReference();
			const plugins = new Map<string, FieldTypePlugin>([[plugin.id, plugin]]);

			expect(validateSpec([mintedField(plugin)], plugins).valid).toBe(true);
		});
	});
});
