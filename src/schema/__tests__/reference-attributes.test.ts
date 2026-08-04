// src/schema/__tests__/reference-attributes.test.ts
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import type { ReferenceSettings } from "../field-types/reference";
import { referencePlugin } from "../field-types/reference";
import {
	countFilledAttributes,
	declaredAttributes,
	isAttributeFilled,
} from "../reference-attributes";
import { resolveSpec } from "../resolve-spec";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";
import { specToZodSchema } from "../zod-builder";

function attribute(
	fieldType: string,
	accessor: string,
	name: string,
	overrides: Partial<Field["config"]> = {},
	settings: unknown = null,
): Field {
	return {
		field_type: fieldType,
		config: {
			name,
			api_accessor: accessor,
			required: false,
			instructions: "",
			...overrides,
		},
		settings,
		children: null,
		system: false,
	};
}

const PAGE = attribute("number", "page", "Page");
const ROLE = attribute(
	"select",
	"role",
	"Role",
	{ required: true },
	{
		options: { author: "Author", editor: "Editor" },
	},
);

function referenceField(attributes: Field[]): Field<ReferenceSettings> {
	return {
		field_type: "reference",
		config: {
			name: "Related articles",
			api_accessor: "related",
			required: false,
			instructions: "",
		},
		settings: { blueprints: [], attributes },
		children: null,
		system: false,
	};
}

/** The Field's Schema as a whole Spec produces it — the only path that hands
 * the plugin its `composeChildren`. */
function schemaFor(attributes: Field[]) {
	return specToZodSchema([referenceField(attributes)], builtInFieldTypes);
}

describe("counting what a Reference has filled in", () => {
	it("counts an answered Attribute and skips an unanswered one", () => {
		expect(countFilledAttributes([PAGE, ROLE], { page: 12 })).toBe(1);
		expect(
			countFilledAttributes([PAGE, ROLE], { page: 12, role: "author" }),
		).toBe(2);
		expect(countFilledAttributes([PAGE, ROLE], {})).toBe(0);
		expect(countFilledAttributes([PAGE, ROLE], undefined)).toBe(0);
	});

	it("reads the four ways a control says nothing as unanswered", () => {
		expect(isAttributeFilled(undefined)).toBe(false);
		expect(isAttributeFilled(null)).toBe(false);
		expect(isAttributeFilled("")).toBe(false);
		expect(isAttributeFilled("   ")).toBe(false);
		expect(isAttributeFilled([])).toBe(false);
	});

	it("reads a false and a zero as answers, because that is what they are", () => {
		// A count that disagreed with the Schema about whether a required
		// Attribute was satisfied would be worse than no count at all.
		expect(isAttributeFilled(false)).toBe(true);
		expect(isAttributeFilled(0)).toBe(true);
	});

	it("counts over the Spec, so a deleted Attribute's leftover key does not", () => {
		// Nothing on screen still offers it, so counting it would report
		// attention no drawer can be paid.
		expect(countFilledAttributes([PAGE], { page: 3, role: "author" })).toBe(1);
	});

	it("asks for no hidden Attribute, so a count cannot outrun the drawer", () => {
		const hidden = attribute("text", "note", "Note", { hidden: true });
		expect(
			declaredAttributes([PAGE, hidden]).map((f) => f.config.name),
		).toEqual(["Page"]);
		expect(countFilledAttributes([PAGE, hidden], { page: 1, note: "x" })).toBe(
			1,
		);
	});

	it("asks for no value-less Marker either", () => {
		// The type picker offers neither, but nothing validates a hand-written
		// Spec (ADR-0007) — and a Marker counted would leave every Reference
		// permanently one short of full, with nothing on screen to fill.
		const marker = attribute("section", "details", "Details");
		expect(
			declaredAttributes([PAGE, marker]).map((f) => f.config.name),
		).toEqual(["Page"]);
		expect(countFilledAttributes([PAGE, marker], { page: 1 })).toBe(1);
	});
});

describe("the Attribute Spec in a Reference Field's Schema", () => {
	it("types an Attribute rather than accepting any value under its key", () => {
		const schema = schemaFor([PAGE]);

		expect(
			schema.safeParse({ related: [{ id: "a", attributes: { page: 12 } }] })
				.success,
		).toBe(true);
		expect(
			schema.safeParse({
				related: [{ id: "a", attributes: { page: "twelve" } }],
			}).success,
		).toBe(false);
	});

	it("blocks submit on a required Attribute, at the Reference's own path", () => {
		const schema = schemaFor([PAGE, ROLE]);

		const parsed = schema.safeParse({
			related: [{ id: "a", attributes: { page: 12 } }],
		});
		expect(parsed.success).toBe(false);
		expect(parsed.success === false && parsed.error.issues[0].path).toEqual([
			"related",
			0,
			"attributes",
			"role",
		]);
	});

	it("blocks on a Reference that stores no attributes record at all", () => {
		// A Reference added before the Attribute was declared: an absent record
		// must not slip past the check the Author just imposed.
		const parsed = schemaFor([ROLE]).safeParse({ related: [{ id: "a" }] });
		expect(parsed.success).toBe(false);
		expect(parsed.success === false && parsed.error.issues[0].path).toEqual([
			"related",
			0,
			"attributes",
			"role",
		]);
	});

	it("holds a nested Reference to the same Attributes as a root one", () => {
		const schema = schemaFor([ROLE]);

		const parsed = schema.safeParse({
			related: [
				{
					id: "a",
					attributes: { role: "author" },
					children: [{ id: "a1", attributes: {} }],
				},
			],
		});
		expect(parsed.success).toBe(false);
		expect(parsed.success === false && parsed.error.issues[0].path).toEqual([
			"related",
			0,
			"children",
			0,
			"attributes",
			"role",
		]);
	});

	it("leaves an optional Attribute optional, and stores no record without one", () => {
		const schema = schemaFor([PAGE]);
		const value = { related: [{ id: "a" }] };

		const parsed = schema.safeParse(value);
		expect(parsed.success).toBe(true);
		// No `attributes: {}` injected: a Reference that carries nothing about
		// the pointing stores exactly what it stored before Attributes existed.
		expect(parsed.success && parsed.data).toEqual(value);
	});

	it("keeps a key the Spec no longer declares", () => {
		// The same passthrough both container types apply (ADR-0007): validation
		// arriving is no reason to prune an Author's data.
		const value = {
			related: [{ id: "a", attributes: { page: 3, legacy: "kept" } }],
		};
		const parsed = schemaFor([PAGE]).safeParse(value);

		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data).toEqual(value);
	});

	it("holds the opaque record it always did when no Attribute is declared", () => {
		const schema = schemaFor([]);
		const value = { related: [{ id: "a", attributes: { anything: [1, 2] } }] };

		expect(schema.safeParse(value).success).toBe(true);
	});

	it("holds the opaque record for a Consumer calling toZodType with a Field alone", () => {
		// `toZodType` is public API and its second argument is optional, so an
		// Attribute Spec it was never handed a composer for stays uninspected.
		const zodType = referencePlugin.toZodType(referenceField([ROLE]));

		expect(zodType.safeParse([{ id: "a" }]).success).toBe(true);
	});
});

describe("the ADR-0007 boundary the Attribute Spec inherits", () => {
	it("reports no duplicate Accessor between two Attributes", () => {
		const field = referenceField([
			attribute("text", "page", "Page"),
			attribute("number", "page", "Page again"),
		]);

		const result = validateSpec(
			[field],
			new Map(builtInFieldTypes.map((p) => [p.id, p])),
		);
		expect(result.valid).toBe(true);
		expect(result.fieldErrors).toEqual([]);
	});

	it("reports no empty name and no empty Accessor on an Attribute", () => {
		const field = referenceField([attribute("text", "", "")]);

		const result = validateSpec(
			[field],
			new Map(builtInFieldTypes.map((p) => [p.id, p])),
		);
		expect(result.valid).toBe(true);
	});

	it("never resolves a Fieldset declared as an Attribute", async () => {
		// The type picker does not offer one; a hand-written Spec still can, and
		// what it gets is the opaque record any unresolved Fieldset composes as.
		const fieldset = attribute(
			"fieldset",
			"address",
			"Address",
			{},
			{
				blueprint_id: "address-blueprint",
			},
		);
		const fetched: string[] = [];

		const resolved = await resolveSpec(
			[referenceField([fieldset])],
			async (id) => {
				fetched.push(id);
				return [];
			},
		);

		expect(fetched).toEqual([]);
		expect(
			(resolved[0].settings as ReferenceSettings).attributes?.[0].children,
		).toBeNull();
	});

	it("drops an entry of the Spec that is not a Field at all", () => {
		// Nothing shared validates this Spec, so a hand-written one may hold
		// anything. A stray costs itself: it is not counted, not composed, and
		// does not throw where an Accessor was expected.
		const spec = ["not-a-field", null, PAGE] as unknown as Field[];

		expect(declaredAttributes(spec)).toEqual([PAGE]);
		expect(countFilledAttributes(spec, { page: 3 })).toBe(1);
		expect(
			schemaFor(spec).safeParse({
				related: [{ id: "a", attributes: { page: "three" } }],
			}).success,
		).toBe(false);
	});

	it("still composes what it does not check — the later duplicate wins", () => {
		const schema = schemaFor([
			attribute("text", "page", "Page"),
			attribute("number", "page", "Page again"),
		]);

		expect(
			schema.safeParse({ related: [{ id: "a", attributes: { page: 12 } }] })
				.success,
		).toBe(true);
		expect(
			schema.safeParse({ related: [{ id: "a", attributes: { page: "12" } }] })
				.success,
		).toBe(false);
	});
});
