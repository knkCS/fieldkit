// src/table/__tests__/spec-data-table.test.tsx

import { fireEvent, render, screen } from "@testing-library/react";
import { useFormContext } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type {
	CellProps,
	FieldProps,
	FieldTypePlugin,
} from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { SpecDataTable } from "../spec-data-table";

function TestField({ field }: FieldProps) {
	const { register } = useFormContext();
	return (
		<div data-testid={`field-${field.config.api_accessor}`}>
			<label>{field.config.name}</label>
			<input {...register(field.config.api_accessor)} />
		</div>
	);
}
TestField.displayName = "TestField";

function TestCell({ value }: CellProps) {
	return <span data-testid="test-cell">{String(value)}</span>;
}
TestCell.displayName = "TestCell";

const plugins: FieldTypePlugin[] = [
	{
		id: "text",
		name: "Text",
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: TestField,
		cellComponent: TestCell,
		toZodType: () => z.string(),
	},
	{
		id: "number",
		name: "Number",
		description: "",
		icon: () => null,
		category: "number",
		fieldComponent: TestField,
		toZodType: () => z.number(),
	},
];

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

const data = [
	{ title: "Item 1", count: 10 },
	{ title: "Item 2", count: 20 },
	{ title: "Item 3", count: 30 },
];

describe("SpecDataTable", () => {
	it("should render column headers from schema", () => {
		render(<SpecDataTable schema={schema} data={data} plugins={plugins} />);

		expect(screen.getByText("Title")).toBeInTheDocument();
		expect(screen.getByText("Count")).toBeInTheDocument();
	});

	it("should render data rows", () => {
		render(<SpecDataTable schema={schema} data={data} plugins={plugins} />);

		expect(screen.getByText("Item 1")).toBeInTheDocument();
		expect(screen.getByText("Item 2")).toBeInTheDocument();
		expect(screen.getByText("Item 3")).toBeInTheDocument();
	});

	it("should handle empty data", () => {
		render(<SpecDataTable schema={schema} data={[]} plugins={plugins} />);

		expect(screen.getByText("Title")).toBeInTheDocument();
		expect(screen.getByText("Count")).toBeInTheDocument();
		// No data rows, only the header row
		const table = screen.getByRole("table");
		const tbody = table.querySelector("tbody");
		expect(tbody?.children).toHaveLength(0);
	});

	it("should call onRowClick when a row is clicked", () => {
		const onRowClick = vi.fn();
		render(
			<SpecDataTable
				schema={schema}
				data={data}
				plugins={plugins}
				onRowClick={onRowClick}
			/>,
		);

		const rows = screen.getAllByRole("row");
		// rows[0] is the header row, rows[1] is the first data row
		fireEvent.click(rows[1]);
		expect(onRowClick).toHaveBeenCalledWith(0, { title: "Item 1", count: 10 });
	});

	it("should open EditDrawer when editable row is clicked", () => {
		render(
			<SpecDataTable
				schema={schema}
				data={data}
				plugins={plugins}
				editable
				onRowSave={vi.fn()}
			/>,
		);

		const rows = screen.getAllByRole("row");
		fireEvent.click(rows[1]);

		expect(screen.getByTestId("edit-drawer")).toBeInTheDocument();
	});

	it("should apply columnOverrides", () => {
		render(
			<SpecDataTable
				schema={schema}
				data={data}
				plugins={plugins}
				columnOverrides={{
					title: { header: "Custom Title" },
				}}
			/>,
		);

		expect(screen.getByText("Custom Title")).toBeInTheDocument();
		expect(screen.queryByText("Title")).not.toBeInTheDocument();
	});

	it("should append additionalColumns", () => {
		render(
			<SpecDataTable
				schema={schema}
				data={data}
				plugins={plugins}
				additionalColumns={[
					{
						id: "actions",
						header: "Actions",
						cell: () => <button type="button">Edit</button>,
					},
				]}
			/>,
		);

		expect(screen.getByText("Actions")).toBeInTheDocument();
		expect(screen.getAllByText("Edit")).toHaveLength(3);
	});

	it("should support client-side pagination", () => {
		const manyRows = Array.from({ length: 10 }, (_, i) => ({
			title: `Item ${i + 1}`,
			count: i + 1,
		}));

		render(
			<SpecDataTable
				schema={schema}
				data={manyRows}
				plugins={plugins}
				pageSize={3}
			/>,
		);

		// Should only show 3 rows on first page
		const table = screen.getByRole("table");
		const tbody = table.querySelector("tbody");
		expect(tbody?.children).toHaveLength(3);

		// Should show pagination controls
		expect(screen.getByText("Next")).toBeInTheDocument();
		expect(screen.getByText("Previous")).toBeInTheDocument();
	});

	it("should navigate pages when pagination buttons are clicked", () => {
		const manyRows = Array.from({ length: 6 }, (_, i) => ({
			title: `Item ${i + 1}`,
			count: i + 1,
		}));

		render(
			<SpecDataTable
				schema={schema}
				data={manyRows}
				plugins={plugins}
				pageSize={3}
			/>,
		);

		// Page 1: Items 1-3
		expect(screen.getByText("Item 1")).toBeInTheDocument();
		expect(screen.queryByText("Item 4")).not.toBeInTheDocument();

		// Go to page 2
		fireEvent.click(screen.getByText("Next"));
		expect(screen.getByText("Item 4")).toBeInTheDocument();
		expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
	});

	it("should have displayName", () => {
		expect(SpecDataTable.displayName).toBe("SpecDataTable");
	});
});
