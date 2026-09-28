// src/schema/__tests__/virtual-table-row-spec.test.ts
//
// ADR-0017 at the Spec level: a Virtual Table declares its Row Spec in exactly
// one of two ways, and a Row Spec holds only flat value Fields — the `row`
// Position (ADR-0022). The running
// example is a neutral "line items" table — an order line with a description,
// a quantity and a unit price.
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import { createRegistry } from "../registry";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";
import { virtualTableRowSpecKind } from "../virtual-table-row-spec";

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
			expect(codes([lineItems({ columns })])).toContain("position");
		}
	});

	it("refuses a Marker in a Row Spec — a row has no Tab and no Card", () => {
		for (const marker of ["section", "card"]) {
			const columns = [DESCRIPTION, field(marker, "divider")];
			const errors = validateSpec(
				[lineItems({ columns })],
				plugins,
			).fieldErrors;
			const error = errors.find((e) => e.code === "position");
			expect(error?.accessor).toBe("divider");
			expect(error?.path).toBe("/line_items/children/divider");
			expect(error?.params).toEqual({ position: "row", field_type: marker });
		}
	});

	it("refuses a nested Virtual Table in a Row Spec", () => {
		const columns = [DESCRIPTION, lineItems({ blueprint: "line_item_bp" })];
		expect(codes([lineItems({ columns })])).toContain("position");
	});

	it("accepts every flat value type ADR-0017 allows as a column", () => {
		const columns = builtInFieldTypes
			.filter((plugin) => plugin.positions?.includes("row"))
			.map((plugin) => field(plugin.id, `col_${plugin.id}`));
		expect(columns).toHaveLength(17);
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

describe("the Virtual Table's Consumers", () => {
	it("is offered to the blueprint, task and form Consumers", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);
		for (const consumer of ["blueprint", "task", "form"] as const) {
			expect(registry.getByConsumer(consumer).map((p) => p.id)).toContain(
				"virtual_table",
			);
		}
	});

	it("may not sit in a Reference Spec — it is a container", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);
		expect(
			registry.getByPosition("reference_spec").map((p) => p.id),
		).not.toContain("virtual_table");
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
