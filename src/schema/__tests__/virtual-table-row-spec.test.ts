// src/schema/__tests__/virtual-table-row-spec.test.ts
//
// ADR-0017 at the Spec level: a Virtual Table declares its Row Spec in exactly
// one of two ways, and a Row Spec holds only flat value Fields. The running
// example is a neutral "line items" table — an order line with a description,
// a quantity and a unit price.
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import { createRegistry } from "../registry";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";
import {
	isVirtualTableRowFieldType,
	VIRTUAL_TABLE_ROW_FIELD_TYPES,
	virtualTableRowSpecKind,
} from "../virtual-table-row-spec";

function field(
	fieldType: string,
	accessor: string,
	extra?: Partial<Field>,
): Field {
	return {
		field_type: fieldType,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
		...extra,
	};
}

/** A Virtual Table named `line_items`, declared whichever way the test needs. */
function lineItems(options: {
	blueprint?: string;
	columns?: Field[] | null;
}): Field {
	return field("virtual_table", "line_items", {
		settings: options.blueprint ? { blueprint: options.blueprint } : {},
		children: options.columns ?? null,
	});
}

const DESCRIPTION = field("text", "description");
const QUANTITY = field("number", "quantity");

/** Every built-in plugin, which is what a Consumer's editor validates with. */
const plugins = new Map<string, FieldTypePlugin>(
	builtInFieldTypes.map((plugin) => [plugin.id, plugin]),
);

function codes(fields: Field[]): string[] {
	return validateSpec(fields, plugins).fieldErrors.map((error) => error.code);
}

describe("virtualTableRowSpecKind", () => {
	it("reads a named Blueprint as a linked Row Spec", () => {
		expect(
			virtualTableRowSpecKind(lineItems({ blueprint: "line_item_bp" })),
		).toBe("linked");
	});

	it("reads children as an embedded Row Spec", () => {
		expect(virtualTableRowSpecKind(lineItems({ columns: [DESCRIPTION] }))).toBe(
			"embedded",
		);
	});

	it("reads a blank Blueprint id as no link at all", () => {
		// What clearing the picker leaves behind — not a Blueprint anyone can
		// resolve, so it must not read as the Row Spec this Field has.
		expect(virtualTableRowSpecKind(lineItems({ blueprint: "   " }))).toBe(
			"neither",
		);
	});

	it("reads an empty children array as no Row Spec, not an embedded one", () => {
		// A table with no columns declares nothing — and it is also what
		// resolving an empty Blueprint leaves on a linked Field.
		expect(virtualTableRowSpecKind(lineItems({ columns: [] }))).toBe("neither");
	});
});

describe("validateSpec — a Virtual Table's Row Spec (ADR-0017)", () => {
	it("accepts a linked Row Spec on its own", () => {
		const result = validateSpec(
			[lineItems({ blueprint: "line_item_bp" })],
			plugins,
		);
		expect(result.valid).toBe(true);
		expect(result.fieldErrors).toHaveLength(0);
	});

	it("accepts an embedded Row Spec on its own", () => {
		const result = validateSpec(
			[lineItems({ columns: [DESCRIPTION, QUANTITY] })],
			plugins,
		);
		expect(result.valid).toBe(true);
		expect(result.fieldErrors).toHaveLength(0);
	});

	it("refuses a Field that both links a Blueprint and carries columns", () => {
		const result = validateSpec(
			[lineItems({ blueprint: "line_item_bp", columns: [DESCRIPTION] })],
			plugins,
		);
		expect(result.valid).toBe(false);
		expect(
			codes([lineItems({ blueprint: "b", columns: [DESCRIPTION] })]),
		).toEqual(["virtual_table_row_spec_ambiguous"]);
		expect(result.errors[0]).toContain("line_items");
	});

	it("refuses a Field with neither a linked nor an embedded Row Spec", () => {
		const result = validateSpec([lineItems({})], plugins);
		expect(result.valid).toBe(false);
		expect(result.fieldErrors.map((e) => e.code)).toEqual([
			"virtual_table_row_spec_missing",
		]);
		expect(result.fieldErrors[0].accessor).toBe("line_items");
	});

	it("refuses a container in a Row Spec — a column cannot hold a second level", () => {
		for (const container of ["group", "fieldset", "blocks", "array", "list"]) {
			const columns = [DESCRIPTION, field(container, "nested")];
			expect(codes([lineItems({ columns })])).toContain(
				"virtual_table_row_field_type",
			);
		}
	});

	it("refuses a Marker in a Row Spec — a row has no Tab and no Card", () => {
		for (const marker of ["section", "card"]) {
			const columns = [DESCRIPTION, field(marker, "divider")];
			const errors = validateSpec(
				[lineItems({ columns })],
				plugins,
			).fieldErrors;
			expect(errors.map((e) => e.code)).toContain(
				"virtual_table_row_field_type",
			);
			expect(
				errors.find((e) => e.code === "virtual_table_row_field_type")?.accessor,
			).toBe("divider");
		}
	});

	it("refuses a nested Virtual Table in a Row Spec", () => {
		const columns = [DESCRIPTION, lineItems({ blueprint: "line_item_bp" })];
		expect(codes([lineItems({ columns })])).toContain(
			"virtual_table_row_field_type",
		);
	});

	it("accepts every flat value type ADR-0017 allows as a column", () => {
		const columns = VIRTUAL_TABLE_ROW_FIELD_TYPES.map((type) =>
			field(type, `col_${type}`),
		);
		const result = validateSpec([lineItems({ columns })], plugins);
		expect(result.fieldErrors).toEqual([]);
		expect(result.valid).toBe(true);
	});

	it("checks a Virtual Table nested inside a Group", () => {
		const group = field("group", "orders", {
			children: [lineItems({})],
		});
		expect(codes([group])).toEqual(["virtual_table_row_spec_missing"]);
	});

	it("leaves every other Field type alone", () => {
		const result = validateSpec(
			[DESCRIPTION, field("group", "authors", { children: [QUANTITY] })],
			plugins,
		);
		expect(result.valid).toBe(true);
	});
});

describe("isVirtualTableRowFieldType", () => {
	it("says yes to the flat value types and no to the rest", () => {
		expect(isVirtualTableRowFieldType("text")).toBe(true);
		expect(isVirtualTableRowFieldType("media")).toBe(true);
		expect(isVirtualTableRowFieldType("single_reference")).toBe(true);
		expect(isVirtualTableRowFieldType("group")).toBe(false);
		expect(isVirtualTableRowFieldType("reference")).toBe(false);
		expect(isVirtualTableRowFieldType("section")).toBe(false);
	});

	it("names only types the catalogue actually registers", () => {
		// A typo in the list would silently refuse a legitimate column, so the
		// allowlist is checked against the built-in plugins rather than itself.
		const registered = new Set(builtInFieldTypes.map((plugin) => plugin.id));
		for (const type of VIRTUAL_TABLE_ROW_FIELD_TYPES) {
			expect(registered.has(type)).toBe(true);
		}
	});
});

describe("the Virtual Table's Field Contexts", () => {
	it("is offered in the blueprint, task and form contexts", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);
		for (const context of ["blueprint", "task", "form"] as const) {
			expect(registry.getByContext(context).map((p) => p.id)).toContain(
				"virtual_table",
			);
		}
	});

	it("is not offered as an Attribute — it is a reference-category container", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);
		expect(registry.getByContext("attribute").map((p) => p.id)).not.toContain(
			"virtual_table",
		);
	});
});

describe("validateSpec takes an authored Spec, not a Resolved one", () => {
	it("reports a resolved linked Row Spec as ambiguous — validate before you resolve", () => {
		// `resolveSpec()` leaves a linked Field naming a Blueprint AND holding
		// its Fields, which is the shape the renderer and the Schema builder
		// consume. Pinned rather than special-cased: nothing structural tells a
		// resolved linked Field from an Author who declared both.
		const resolved = lineItems({
			blueprint: "line_item_bp",
			columns: [DESCRIPTION],
		});
		expect(codes([resolved])).toEqual(["virtual_table_row_spec_ambiguous"]);
	});
});
