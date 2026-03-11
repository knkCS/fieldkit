// src/table/__tests__/get-cell-for-type.test.tsx

import {
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CellProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { getCellForFieldType } from "../get-cell-for-type";

function CustomCell({ value }: CellProps) {
	return <span data-testid="custom-cell">{String(value)}</span>;
}
CustomCell.displayName = "CustomCell";

const textPlugin: FieldTypePlugin = {
	id: "text",
	name: "Text",
	description: "",
	icon: () => null,
	category: "text",
	fieldComponent: () => null,
	cellComponent: CustomCell,
	toZodType: () => z.string(),
};

const numberPlugin: FieldTypePlugin = {
	id: "number",
	name: "Number",
	description: "",
	icon: () => null,
	category: "number",
	fieldComponent: () => null,
	toZodType: () => z.number(),
};

const sectionPlugin: FieldTypePlugin = {
	id: "section",
	name: "Section",
	description: "",
	icon: () => null,
	category: "structural",
	fieldComponent: () => null,
	toZodType: () => z.never(),
};

const plugins: FieldTypePlugin[] = [textPlugin, numberPlugin, sectionPlugin];

function makeField(
	overrides: Partial<Field> & { field_type: string; config: Field["config"] },
): Field {
	return {
		settings: null,
		children: null,
		system: false,
		...overrides,
	};
}

function TableRenderer({
	schema,
	data,
}: {
	schema: Schema;
	data: Record<string, unknown>[];
}) {
	const columns = getCellForFieldType(schema, plugins);
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<table>
			<thead>
				{table.getHeaderGroups().map((hg) => (
					<tr key={hg.id}>
						{hg.headers.map((header) => (
							<th key={header.id}>
								{flexRender(
									header.column.columnDef.header,
									header.getContext(),
								)}
							</th>
						))}
					</tr>
				))}
			</thead>
			<tbody>
				{table.getRowModel().rows.map((row) => (
					<tr key={row.id}>
						{row.getVisibleCells().map((cell) => (
							<td key={cell.id}>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

describe("getCellForFieldType", () => {
	it("should generate columns from schema", () => {
		const schema: Schema = [
			makeField({
				field_type: "text",
				config: {
					name: "Title",
					api_accessor: "title",
					required: true,
					instructions: "",
				},
			}),
			makeField({
				field_type: "number",
				config: {
					name: "Count",
					api_accessor: "count",
					required: false,
					instructions: "",
				},
			}),
		];

		const columns = getCellForFieldType(schema, plugins);
		expect(columns).toHaveLength(2);
		expect(columns[0].id).toBe("title");
		expect(columns[0].header).toBe("Title");
		expect(columns[1].id).toBe("count");
		expect(columns[1].header).toBe("Count");
	});

	it("should skip section fields", () => {
		const schema: Schema = [
			makeField({
				field_type: "text",
				config: {
					name: "Title",
					api_accessor: "title",
					required: true,
					instructions: "",
				},
			}),
			makeField({
				field_type: "section",
				config: {
					name: "Details",
					api_accessor: "details_section",
					required: false,
					instructions: "",
				},
			}),
		];

		const columns = getCellForFieldType(schema, plugins);
		expect(columns).toHaveLength(1);
		expect(columns[0].id).toBe("title");
	});

	it("should skip hidden fields", () => {
		const schema: Schema = [
			makeField({
				field_type: "text",
				config: {
					name: "Title",
					api_accessor: "title",
					required: true,
					instructions: "",
				},
			}),
			makeField({
				field_type: "text",
				config: {
					name: "Secret",
					api_accessor: "secret",
					required: false,
					instructions: "",
					hidden: true,
				},
			}),
		];

		const columns = getCellForFieldType(schema, plugins);
		expect(columns).toHaveLength(1);
		expect(columns[0].id).toBe("title");
	});

	it("should use plugin cellComponent when available", () => {
		const schema: Schema = [
			makeField({
				field_type: "text",
				config: {
					name: "Title",
					api_accessor: "title",
					required: true,
					instructions: "",
				},
			}),
		];

		render(<TableRenderer schema={schema} data={[{ title: "Hello" }]} />);

		expect(screen.getByTestId("custom-cell")).toHaveTextContent("Hello");
	});

	it("should fall back to string rendering when no cellComponent", () => {
		const schema: Schema = [
			makeField({
				field_type: "number",
				config: {
					name: "Count",
					api_accessor: "count",
					required: false,
					instructions: "",
				},
			}),
		];

		render(<TableRenderer schema={schema} data={[{ count: 42 }]} />);

		expect(screen.getByText("42")).toBeInTheDocument();
	});

	it("should render empty string for null/undefined values in fallback", () => {
		const schema: Schema = [
			makeField({
				field_type: "number",
				config: {
					name: "Count",
					api_accessor: "count",
					required: false,
					instructions: "",
				},
			}),
		];

		const { container } = render(
			<TableRenderer schema={schema} data={[{ count: null }]} />,
		);

		const cell = container.querySelector("td span");
		expect(cell).toHaveTextContent("");
	});
});
