import { BookOpen } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { FieldTypePlugin } from "../../plugin";
import type { Field } from "../../types";
import { validateSpec } from "../../validate-spec";
import { specToZodSchema } from "../../zod-builder";
import { builtInFieldTypes } from "../index";
import type { ReferencePluginOptions, ReferenceSettings } from "../reference";
import {
	createReferencePlugin,
	referenceDepthCeiling,
	referenceItemCap,
	referencePlugin,
} from "../reference";

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
			// And declaring no Attributes: a Reference that carries nothing about
			// the pointing is the ordinary case.
			attributes: [],
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

/** The messages and paths a failed parse reports, in the order Zod raised them. */
function issues(
	zodType: ReturnType<typeof referencePlugin.toZodType>,
	value: unknown,
) {
	const parsed = zodType.safeParse(value);
	return parsed.success
		? []
		: parsed.error.issues.map((issue) => ({
				path: issue.path,
				message: issue.message,
			}));
}

describe("referenceItemCap", () => {
	it("reads the cap an Author set", () => {
		expect(referenceItemCap({ max_items: 3 })).toBe(3);
	});

	it("reads an unset cap as no cap — undefined, null, or no settings at all", () => {
		// The criterion knkCMS core gets wrong: an uncapped Field must not
		// behave as one capped at zero.
		expect(referenceItemCap({})).toBeUndefined();
		expect(referenceItemCap({ max_items: undefined })).toBeUndefined();
		expect(
			referenceItemCap({ max_items: null } as unknown as ReferenceSettings),
		).toBeUndefined();
		expect(referenceItemCap(null)).toBeUndefined();
		expect(referenceItemCap(undefined)).toBeUndefined();
	});

	it("reads zero as a cap of zero, which is not the same as unset", () => {
		expect(referenceItemCap({ max_items: 0 })).toBe(0);
	});

	it("ignores a cap that is not a number at all", () => {
		expect(
			referenceItemCap({ max_items: "3" } as unknown as ReferenceSettings),
		).toBeUndefined();
		expect(referenceItemCap({ max_items: Number.NaN })).toBeUndefined();
	});
});

describe("referenceDepthCeiling", () => {
	it("turns a count of levels into the deepest depth index, roots being 0", () => {
		// `max_depth` counts levels; `projectDropDepth` and the Schema both
		// take a depth index. One level of References is roots and nothing
		// under them, which is depth 0.
		expect(referenceDepthCeiling({ max_depth: 1 })).toBe(0);
		expect(referenceDepthCeiling({ max_depth: 2 })).toBe(1);
		expect(referenceDepthCeiling({ max_depth: 3 })).toBe(2);
	});

	it("reads an unset depth as no ceiling", () => {
		expect(referenceDepthCeiling({})).toBeUndefined();
		expect(referenceDepthCeiling({ max_depth: undefined })).toBeUndefined();
		expect(
			referenceDepthCeiling({
				max_depth: null,
			} as unknown as ReferenceSettings),
		).toBeUndefined();
		expect(referenceDepthCeiling(null)).toBeUndefined();
	});

	it("reads zero levels as a ceiling no depth reaches", () => {
		expect(referenceDepthCeiling({ max_depth: 0 })).toBe(-1);
	});
});

describe("the max_items cap in the Schema", () => {
	const capped = (max_items: number | undefined) =>
		referencePlugin.toZodType(makeField({ settings: { max_items } }));

	it("counts every Reference in the tree, not only the roots", () => {
		// Two roots and one child is three References, which is one past a cap
		// of two even though only two of them are roots.
		expect(
			issues(capped(2), [{ id: "a", children: [{ id: "a1" }] }, { id: "b" }]),
		).toEqual([
			{ path: [], message: "Related articles holds at most 2 references" },
		]);
	});

	it("allows a tree that sits exactly on the cap", () => {
		expect(
			capped(3).safeParse([{ id: "a", children: [{ id: "a1" }] }, { id: "b" }])
				.success,
		).toBe(true);
	});

	it("reports at the Field's own path, so the form can show it on the Field", () => {
		expect(issues(capped(1), [{ id: "a" }, { id: "b" }])[0].path).toEqual([]);
	});

	it("caps nothing when max_items is unset", () => {
		// The criterion: an unset cap is no cap, however large the tree is.
		const uncapped = referencePlugin.toZodType(makeField({ settings: {} }));
		expect(
			uncapped.safeParse([
				{ id: "a", children: [{ id: "a1", children: [{ id: "a1x" }] }] },
				{ id: "b" },
			]).success,
		).toBe(true);
	});

	it("caps at zero when max_items is zero, which unset never does", () => {
		expect(capped(0).safeParse([{ id: "a" }]).success).toBe(false);
		expect(capped(0).safeParse([]).success).toBe(true);
	});

	it("names one reference in the singular", () => {
		expect(issues(capped(1), [{ id: "a" }, { id: "b" }])[0].message).toBe(
			"Related articles holds at most 1 reference",
		);
	});
});

describe("the max_depth cap in the Schema", () => {
	const nested = (max_depth: number | undefined) =>
		referencePlugin.toZodType(makeField({ settings: { max_depth } }));

	it("forbids nesting entirely at max_depth 1, roots being the one level", () => {
		// The boundary, spelled out: `max_depth` counts levels, so one level is
		// a flat list. This is the assertion the whole dialect turns on.
		expect(nested(1).safeParse([{ id: "a" }, { id: "b" }]).success).toBe(true);
		expect(
			nested(1).safeParse([{ id: "a", children: [{ id: "a1" }] }]).success,
		).toBe(false);
	});

	it("permits exactly one level of nesting at max_depth 2", () => {
		expect(
			nested(2).safeParse([{ id: "a", children: [{ id: "a1" }] }]).success,
		).toBe(true);
		expect(
			nested(2).safeParse([
				{ id: "a", children: [{ id: "a1", children: [{ id: "a1x" }] }] },
			]).success,
		).toBe(false);
	});

	it("reports at the path of the offending Reference", () => {
		expect(
			issues(nested(2), [
				{ id: "a", children: [{ id: "a1", children: [{ id: "a1x" }] }] },
			]),
		).toEqual([
			{
				path: [0, "children", 0, "children", 0],
				message: "Related articles nests at most 2 levels deep",
			},
		]);
	});

	it("reports the Reference that broke the cap, not every one under it", () => {
		const reported = issues(nested(1), [
			{
				id: "a",
				children: [{ id: "a1", children: [{ id: "a1x" }] }, { id: "a2" }],
			},
		]);

		expect(reported.map((issue) => issue.path)).toEqual([
			[0, "children", 0],
			[0, "children", 1],
		]);
	});

	it("nests as far as an Author drags it when max_depth is unset", () => {
		expect(
			nested(undefined).safeParse([
				{ id: "a", children: [{ id: "a1", children: [{ id: "a1x" }] }] },
			]).success,
		).toBe(true);
	});

	it("allows no Reference at all at max_depth 0, which unset never does", () => {
		expect(nested(0).safeParse([{ id: "a" }]).success).toBe(false);
		expect(nested(0).safeParse([]).success).toBe(true);
	});

	it("names one level in the singular", () => {
		expect(
			issues(nested(1), [{ id: "a", children: [{ id: "a1" }] }])[0].message,
		).toBe("Related articles nests at most 1 level deep");
	});
});

describe("both caps at once", () => {
	it("reports each cap the tree breaks, at its own path", () => {
		const zodType = referencePlugin.toZodType(
			makeField({ settings: { max_items: 1, max_depth: 1 } }),
		);

		expect(
			issues(zodType, [{ id: "a", children: [{ id: "a1" }] }]).map(
				(issue) => issue.path,
			),
		).toEqual([[], [0, "children", 0]]);
	});

	it("still blocks an empty required tree while a cap is set", () => {
		const zodType = referencePlugin.toZodType(
			makeField({ required: true, settings: { max_items: 2 } }),
		);

		expect(issues(zodType, [])).toEqual([
			{ path: [], message: "Related articles is required" },
		]);
	});

	it("never rewrites a value to fit a cap", () => {
		// Stored data over a cap is reported, never truncated: the parse fails
		// and nothing partial is handed back for a Consumer to save.
		const zodType = referencePlugin.toZodType(
			makeField({ settings: { max_items: 1 } }),
		);
		const value = [{ id: "a" }, { id: "b" }];

		const parsed = zodType.safeParse(value);
		expect(parsed.success).toBe(false);
		expect(value).toEqual([{ id: "a" }, { id: "b" }]);
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
				attributes: [],
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

		it("enforces both caps, so a Consumer's type cannot drift from reference", () => {
			const plugin = tocReference();
			const field = mintedField(plugin);

			const capped = plugin.toZodType({
				...field,
				settings: { max_items: 2 },
			});
			expect(
				capped.safeParse([{ id: "a", children: [{ id: "a1" }] }, { id: "b" }])
					.success,
			).toBe(false);

			const shallow = plugin.toZodType({
				...field,
				settings: { max_depth: 1 },
			});
			expect(
				shallow.safeParse([{ id: "a", children: [{ id: "a1" }] }]).success,
			).toBe(false);
			expect(shallow.safeParse([{ id: "a" }, { id: "b" }]).success).toBe(true);
		});

		it("carries a cap the Consumer defaulted into every new Field", () => {
			const plugin = tocReference({ defaultSettings: { max_depth: 2 } });

			expect(plugin.defaultSettings?.max_depth).toBe(2);
			expect(
				plugin
					.toZodType({
						...mintedField(plugin),
						settings: plugin.defaultSettings ?? null,
					})
					.safeParse([
						{ id: "a", children: [{ id: "a1", children: [{ id: "a1x" }] }] },
					]).success,
			).toBe(false);
		});

		it("composes a minted type's own Attribute Spec", () => {
			// The factory's promise: a Consumer's reference-shaped type cannot
			// drift from `reference` without the drift being deliberate — so an
			// Attribute declared on one is checked on the same terms (ADR-0007).
			const plugin = tocReference();
			const field = mintedField(plugin);
			field.settings = {
				attributes: [
					{
						field_type: "number",
						config: {
							name: "Page",
							api_accessor: "page",
							required: true,
							instructions: "",
						},
						settings: null,
						children: null,
						system: false,
					},
				],
			};
			const schema = specToZodSchema([field], [...builtInFieldTypes, plugin]);

			expect(schema.safeParse({ toc: [{ id: "a" }] }).success).toBe(false);
			expect(
				schema.safeParse({ toc: [{ id: "a", attributes: { page: 3 } }] })
					.success,
			).toBe(true);
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
