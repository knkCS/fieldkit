import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { specToZodSchema } from "../../zod-builder";
import { builtInFieldTypes } from "../index";
import type { VirtualTableSettings } from "../virtual-table";
import { virtualTablePlugin } from "../virtual-table";

describe("virtualTablePlugin", () => {
	it("should have correct metadata", () => {
		expect(virtualTablePlugin.id).toBe("virtual_table");
		expect(virtualTablePlugin.category).toBe("reference");
	});

	it("should generate array of record objects Zod type", () => {
		const field: Field<VirtualTableSettings> = {
			field_type: "virtual_table",
			config: {
				name: "Entries",
				api_accessor: "entries",
				required: false,
				instructions: "",
			},
			settings: { blueprint: "articles" },
			children: null,
			system: false,
		};
		const zodType = virtualTablePlugin.toZodType(field);
		expect(zodType.safeParse([]).success).toBe(true);
		expect(
			zodType.safeParse([{ _id: "r46", title: "Hello", count: 42 }]).success,
		).toBe(true);
		expect(zodType.safeParse([{ _id: "r47", nested: { a: 1 } }]).success).toBe(
			true,
		);
	});

	it("should reject non-array values", () => {
		const field: Field<VirtualTableSettings> = {
			field_type: "virtual_table",
			config: {
				name: "Entries",
				api_accessor: "entries",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = virtualTablePlugin.toZodType(field);
		expect(zodType.safeParse("not an array").success).toBe(false);
		expect(zodType.safeParse(42).success).toBe(false);
	});

	it("should have default settings with max_records_per_page", () => {
		expect(virtualTablePlugin.defaultSettings).toEqual({
			max_records_per_page: 25,
		});
	});
});

// ADR-0017: the type is an array of row objects composed from the resolved Row
// Spec, as a Group composes its children. The running example is a neutral
// "line items" table.
describe("virtualTablePlugin — rows composed from the resolved Row Spec", () => {
	function column(
		fieldType: string,
		accessor: string,
		required = false,
	): Field {
		return {
			field_type: fieldType,
			config: {
				name: accessor,
				api_accessor: accessor,
				required,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
	}

	function lineItems(
		columns: Field[] | null,
		settings: VirtualTableSettings = {},
	): Field<VirtualTableSettings> {
		return {
			field_type: "virtual_table",
			config: {
				name: "Line items",
				api_accessor: "line_items",
				required: false,
				instructions: "",
			},
			settings,
			children: columns,
			system: false,
		};
	}

	const ROW_SPEC = [
		column("text", "description", true),
		column("number", "quantity", true),
	];

	/** What `specToZodSchema` hands a container plugin (ADR-0007). */
	const composeChildren = (children: Field[]) =>
		specToZodSchema(children, builtInFieldTypes);

	it("rejects a row whose column has the wrong type, naming row and column", () => {
		const zodType = virtualTablePlugin.toZodType(
			lineItems(ROW_SPEC),
			composeChildren,
		);

		const result = zodType.safeParse([
			{ _id: "r48", description: "Binding", quantity: 3 },
			{ _id: "r49", description: "Cover", quantity: "three" },
		]);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0].path).toEqual([1, "quantity"]);
	});

	it("rejects a row missing a required column, naming row and column", () => {
		const zodType = virtualTablePlugin.toZodType(
			lineItems(ROW_SPEC),
			composeChildren,
		);

		const result = zodType.safeParse([{ _id: "r50", quantity: 1 }]);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0].path).toEqual([0, "description"]);
	});

	it("reports the column under the Field's own accessor through specToZodSchema", () => {
		// The path the renderer registers a row's control under, so an error
		// lands on the control that caused it.
		const schema = specToZodSchema([lineItems(ROW_SPEC)], builtInFieldTypes);

		const result = schema.safeParse({
			line_items: [
				{ _id: "r51", description: "Binding", quantity: 2 },
				{ _id: "r52", description: "Cover" },
			],
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0].path).toEqual(["line_items", 1, "quantity"]);
	});

	it("keeps keys the Row Spec does not edit", () => {
		// A stored row carries a backend id; validating rows must not prune it.
		const zodType = virtualTablePlugin.toZodType(
			lineItems(ROW_SPEC),
			composeChildren,
		);

		const result = zodType.safeParse([
			{ _id: "r53", id: "row-1", description: "Binding", quantity: 3 },
		]);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data[0]).toMatchObject({ id: "row-1" });
	});

	it("rejects too few rows", () => {
		const zodType = virtualTablePlugin.toZodType(
			lineItems(ROW_SPEC, { min_items: 2 }),
			composeChildren,
		);

		expect(
			zodType.safeParse([{ _id: "r54", description: "Binding", quantity: 1 }])
				.success,
		).toBe(false);
		expect(
			zodType.safeParse([
				{ _id: "r55", description: "Binding", quantity: 1 },
				{ _id: "r56", description: "Cover", quantity: 2 },
			]).success,
		).toBe(true);
	});

	it("rejects too many rows", () => {
		const zodType = virtualTablePlugin.toZodType(
			lineItems(ROW_SPEC, { max_items: 1 }),
			composeChildren,
		);

		expect(
			zodType.safeParse([
				{ _id: "r57", description: "Binding", quantity: 1 },
				{ _id: "r58", description: "Cover", quantity: 2 },
			]).success,
		).toBe(false);
		expect(
			zodType.safeParse([{ _id: "r59", description: "Binding", quantity: 1 }])
				.success,
		).toBe(true);
	});

	it("keeps the opaque row when the Row Spec was never resolved", () => {
		// A Consumer who skipped `resolveSpec()` on a linked Row Spec: the
		// Schema must not reject values for Fields fieldkit was never told
		// about (the Fieldset reasoning, ADR-0003).
		const zodType = virtualTablePlugin.toZodType(
			lineItems(null, { blueprint: "line_item_bp" }),
			composeChildren,
		);

		expect(zodType.safeParse([{ _id: "r60", anything: true }]).success).toBe(
			true,
		);
	});

	it("is offered to every Consumer", () => {
		expect(virtualTablePlugin.consumers).toEqual(["blueprint", "task", "form"]);
	});

	it("sits at the root and in a Block Type, and holds its children in row", () => {
		expect(virtualTablePlugin.positions).toEqual(["root", "block_type"]);
		expect(virtualTablePlugin.childrenPosition).toBe("row");
	});
});

describe("virtualTablePlugin — an empty Blueprint is still resolved", () => {
	it("composes the empty Row Spec rather than falling back to the opaque row", () => {
		// `resolveSpec()` attaches `[]` for a Blueprint with no Fields, and
		// `children != null` is what "resolved" means everywhere else too.
		const field: Field<VirtualTableSettings> = {
			field_type: "virtual_table",
			config: {
				name: "Line items",
				api_accessor: "line_items",
				required: false,
				instructions: "",
			},
			settings: { blueprint: "empty_bp" },
			children: [],
			system: false,
		};

		const zodType = virtualTablePlugin.toZodType(field, (children) =>
			specToZodSchema(children, builtInFieldTypes),
		);

		expect(zodType.safeParse([{ _id: "r61", anything: true }]).success).toBe(
			true,
		);
		expect(zodType.safeParse("not an array").success).toBe(false);
	});
});
