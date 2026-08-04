import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { getDefaultValues, specToZodSchema } from "../../zod-builder";
import type { FieldsetSettings } from "../fieldset";
import { fieldsetPlugin } from "../fieldset";
import { builtInFieldTypes } from "../index";

function fieldsetField(
	overrides: { required?: boolean; settings?: FieldsetSettings | null } = {},
): Field<FieldsetSettings> {
	return {
		field_type: "fieldset",
		config: {
			name: "Address",
			api_accessor: "address",
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: overrides.settings ?? { blueprint: "address_bp" },
		children: null,
		system: false,
	};
}

/** One child as a Blueprint hands it over: a plain accessor, no nesting. */
function childField(overrides: { required?: boolean } = {}): Field {
	return {
		field_type: "text",
		config: {
			name: "Street",
			api_accessor: "street",
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
	};
}

/** A Fieldset as `resolveSpec()` returns it — children attached. */
function resolvedFieldset(
	children: Field[],
	overrides: { required?: boolean } = {},
): Field<FieldsetSettings> {
	return { ...fieldsetField(overrides), children };
}

describe("fieldsetPlugin", () => {
	it("has structural metadata and is registered as a built-in", () => {
		expect(fieldsetPlugin.id).toBe("fieldset");
		expect(fieldsetPlugin.category).toBe("structural");
		expect(builtInFieldTypes.some((p) => p.id === "fieldset")).toBe(true);
	});

	it("starts an inserted fieldset non-collapsible with no blueprint", () => {
		// The state an Author meets straight after inserting one — and the
		// state the renderer's "No blueprint selected" branch exists for.
		expect(fieldsetPlugin.defaultSettings).toEqual({ collapsible: false });
	});

	it("produces a value — it is not treated as a value-less marker", () => {
		// Section and Card are skipped by the zod builder and by
		// getDefaultValues. A Fieldset must appear in both: it holds one
		// record nested under its own accessor.
		const schema = specToZodSchema([fieldsetField()], builtInFieldTypes);
		expect(Object.keys(schema.shape)).toContain("address");
		expect(getDefaultValues([fieldsetField()], builtInFieldTypes)).toEqual({
			address: {},
		});
	});

	it("validates one record, not a list of them", () => {
		const zodType = fieldsetPlugin.toZodType(fieldsetField());
		expect(zodType.safeParse({ street: "12 Bridge Lane" }).success).toBe(true);
		expect(zodType.safeParse({}).success).toBe(true);
		expect(zodType.safeParse([{ street: "12 Bridge Lane" }]).success).toBe(
			false,
		);
		expect(zodType.safeParse("12 Bridge Lane").success).toBe(false);
		expect(zodType.safeParse(null).success).toBe(false);
	});

	it("asks only that the record be present when an unresolved field is required", () => {
		// Deliberately weak, and inert against a form seeded by
		// getDefaultValues — `{}` satisfies it. Without children there is
		// nothing to require; a resolved Fieldset asks for them below.
		const schema = specToZodSchema(
			[fieldsetField({ required: true })],
			builtInFieldTypes,
		);
		expect(schema.safeParse({}).success).toBe(false);
		expect(schema.safeParse({ address: {} }).success).toBe(true);
		expect(
			schema.safeParse({ address: { street: "12 Bridge Lane" } }).success,
		).toBe(true);
	});

	it("blocks submit on a required child, and says which one", () => {
		// The claim ADR-0004 exists to make true: a Resolved Fieldset validates
		// its children, and the issue is reported at the child's own path so
		// react-hook-form puts the message on the offending Field.
		const schema = specToZodSchema(
			[resolvedFieldset([childField({ required: true })])],
			builtInFieldTypes,
		);

		const missing = schema.safeParse({ address: {} });
		expect(missing.success).toBe(false);
		expect(missing.error?.issues[0].path).toEqual(["address", "street"]);
		expect(
			schema.safeParse({ address: { street: "12 Bridge Lane" } }).success,
		).toBe(true);
	});

	it("is absent-or-complete when the fieldset itself is optional", () => {
		// What `required` on the Fieldset governs, resolved or not: whether the
		// record has to be there at all. A form seeded by getDefaultValues
		// always has the key — this is the shape a Consumer meets when they
		// pass their own defaultValues instead.
		const schema = specToZodSchema(
			[resolvedFieldset([childField({ required: true })])],
			builtInFieldTypes,
		);
		expect(schema.safeParse({}).success).toBe(true);
		expect(schema.safeParse({ address: {} }).success).toBe(false);
	});

	it("demands the record when the fieldset itself is required", () => {
		const schema = specToZodSchema(
			[resolvedFieldset([childField()], { required: true })],
			builtInFieldTypes,
		);
		expect(schema.safeParse({}).success).toBe(false);
		expect(schema.safeParse({ address: {} }).success).toBe(true);
	});

	it("keeps only what its children declare", () => {
		// The record is a z.object, so parsing drops undeclared keys — the
		// treatment the top level has always given a Spec, now one level
		// deeper (ADR-0007). Anything a Consumer needs on submit is a Field.
		const schema = specToZodSchema(
			[resolvedFieldset([childField()])],
			builtInFieldTypes,
		);
		const parsed = schema.safeParse({
			address: { street: "12 Bridge Lane", legacy_note: "dropped" },
		});
		expect(parsed.data).toEqual({ address: { street: "12 Bridge Lane" } });
	});

	it("lets an optional child through", () => {
		const schema = specToZodSchema(
			[resolvedFieldset([childField()])],
			builtInFieldTypes,
		);
		expect(schema.safeParse({ address: {} }).success).toBe(true);
		expect(schema.safeParse({ address: { street: "" } }).success).toBe(true);
	});

	it("validates children the whole way down a nest of fieldsets", () => {
		const inner = resolvedFieldset([childField({ required: true })]);
		const outer: Field<FieldsetSettings> = {
			...fieldsetField(),
			config: { ...fieldsetField().config, api_accessor: "contact" },
			children: [inner],
		};
		const schema = specToZodSchema([outer], builtInFieldTypes);

		expect(schema.safeParse({ contact: { address: {} } }).success).toBe(false);
		expect(
			schema.safeParse({ contact: { address: { street: "12 Bridge Lane" } } })
				.success,
		).toBe(true);
	});

	it("skips markers and hidden children, as the top level does", () => {
		// A Blueprint carries whatever its Author put in it, Sections included.
		const marker: Field = {
			field_type: "section",
			config: {
				name: "Where",
				api_accessor: "section_where",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const hidden: Field = {
			...childField({ required: true }),
			config: {
				...childField({ required: true }).config,
				api_accessor: "internal",
				hidden: true,
			},
		};
		const schema = specToZodSchema(
			[resolvedFieldset([marker, hidden, childField()])],
			builtInFieldTypes,
		);

		expect(schema.safeParse({ address: {} }).success).toBe(true);
		// Skipped means skipped both ways: a hidden child is neither required
		// nor carried through, exactly as a hidden top-level Field.
		expect(
			schema.safeParse({ address: { internal: "not submitted" } }).data,
		).toEqual({ address: {} });
	});

	it("seeds the record its children describe", () => {
		const defaults = getDefaultValues(
			[resolvedFieldset([childField()])],
			builtInFieldTypes,
		);
		// The text child's own plugin default, not an empty record the form
		// then has to fill in.
		expect(defaults).toEqual({ address: { street: "" } });
	});

	it("seeds a nested fieldset's record too", () => {
		const inner = resolvedFieldset([childField()]);
		const outer: Field<FieldsetSettings> = {
			...fieldsetField(),
			config: { ...fieldsetField().config, api_accessor: "contact" },
			children: [inner],
		};
		expect(getDefaultValues([outer], builtInFieldTypes)).toEqual({
			contact: { address: { street: "" } },
		});
	});

	it("seeds a fresh record per call", () => {
		const a = fieldsetPlugin.defaultValue?.(fieldsetField());
		const b = fieldsetPlugin.defaultValue?.(fieldsetField());
		expect(a).toEqual({});
		expect(a).not.toBe(b);
	});
});
