import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import type { ReferenceSettings } from "../reference";
import { referencePlugin } from "../reference";

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
