// formDefaults(): what a Consumer seeds its form with, before SpecForm mounts
// — the stored value over the Spec's defaults, every row given an `_id`
// (ADR-0023).
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import { formDefaults } from "../form-defaults";
import { isRowId } from "../row-ids";
import type { Field } from "../types";

function field(
	field_type: string,
	api_accessor: string,
	extra: Partial<Field> = {},
	config: Partial<Field["config"]> = {},
): Field {
	return {
		field_type,
		config: {
			name: api_accessor,
			api_accessor,
			required: false,
			instructions: "",
			...config,
		},
		system: false,
		...extra,
	};
}

const title = field("text", "title", {}, { default_value: "Untitled" });
const count = field("number", "count", {}, { default_value: 3 });
const authors = field("group", "authors", {
	children: [field("text", "name")],
});
const address = field("fieldset", "address", {
	children: [field("group", "lines", { children: [field("text", "line")] })],
});
const schema = [title, count, authors, address];

describe("formDefaults", () => {
	it("fills the Spec's defaults into keys the stored value has no key for", () => {
		const values = formDefaults(schema, { count: 7 }, builtInFieldTypes);
		expect(values.title).toBe("Untitled");
		expect(values.count).toBe(7);
	});

	it("seeds from the Spec alone when nothing is stored", () => {
		const values = formDefaults(schema, undefined, builtInFieldTypes);
		expect(values.title).toBe("Untitled");
		expect(values.count).toBe(3);
	});

	it("lets a stored key win over a default, even an Unset one", () => {
		const stored = { title: "", count: undefined };
		const values = formDefaults(schema, stored, builtInFieldTypes);
		expect(values.title).toBe("");
		expect("count" in values).toBe(true);
		expect(values.count).toBeUndefined();
	});

	it("keeps stored keys the Spec does not name", () => {
		const values = formDefaults(schema, { id: "row-1" }, builtInFieldTypes);
		expect(values.id).toBe("row-1");
	});

	it("mints an _id into stored rows without one, inside containers too", () => {
		const stored = {
			authors: [{ name: "Ada" }, { _id: "keep", name: "Grace" }],
			address: { lines: [{ line: "Main St 1" }] },
		};
		const values = formDefaults(schema, stored, builtInFieldTypes);
		const rows = values.authors as Record<string, unknown>[];
		expect(isRowId(rows[0]._id)).toBe(true);
		expect(rows[1]).toEqual({ _id: "keep", name: "Grace" });
		const lines = (values.address as { lines: Record<string, unknown>[] })
			.lines;
		expect(isRowId(lines[0]._id)).toBe(true);
		expect(lines[0].line).toBe("Main St 1");
		// The stored value is not mutated.
		expect(stored.authors[0]).toEqual({ name: "Ada" });
	});

	it("is idempotent on already-normalised input", () => {
		const stored = {
			authors: [{ name: "Ada" }],
			address: { lines: [{ line: "Main St 1" }] },
		};
		const once = formDefaults(schema, stored, builtInFieldTypes);
		const twice = formDefaults(schema, once, builtInFieldTypes);
		expect(twice).toEqual(once);
	});
});
