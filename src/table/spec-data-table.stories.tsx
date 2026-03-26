import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldKitProvider } from "../renderer/provider";
import { boolean, number, select, text } from "../schema/builders";
import { builtInFieldTypes } from "../schema/field-types";
import type { Schema } from "../schema/types";
import { SpecDataTable } from "./spec-data-table";

/* ------------------------------------------------------------------ */
/*  Sample schema & data                                               */
/* ------------------------------------------------------------------ */

const sampleSchema: Schema = [
	text("name", { name: "Name", required: true }),
	number("age", { name: "Age" }),
	boolean("active", { name: "Active" }),
	select("role", {
		name: "Role",
		options: { admin: "Admin", editor: "Editor", viewer: "Viewer" },
	}),
];

const sampleData: Record<string, unknown>[] = [
	{ name: "Alice", age: 30, active: true, role: "admin" },
	{ name: "Bob", age: 25, active: false, role: "editor" },
	{ name: "Charlie", age: 35, active: true, role: "viewer" },
	{ name: "Diana", age: 28, active: true, role: "admin" },
	{ name: "Eve", age: 22, active: false, role: "editor" },
	{ name: "Frank", age: 40, active: true, role: "viewer" },
	{ name: "Grace", age: 33, active: false, role: "admin" },
	{ name: "Hank", age: 29, active: true, role: "editor" },
];

/* ------------------------------------------------------------------ */
/*  Wrapper                                                            */
/* ------------------------------------------------------------------ */

function TableWrapper({
	data: initialData,
	editable,
	pageSize,
	loading,
}: {
	data: Record<string, unknown>[];
	editable?: boolean;
	pageSize?: number;
	loading?: boolean;
}) {
	const [data, setData] = useState(initialData);
	const methods = useForm();

	const handleRowSave = (index: number, values: Record<string, unknown>) => {
		setData((prev) => prev.map((row, i) => (i === index ? values : row)));
	};

	return (
		<FieldKitProvider plugins={builtInFieldTypes}>
			<FormProvider {...methods}>
				<SpecDataTable
					schema={sampleSchema}
					data={data}
					plugins={builtInFieldTypes}
					editable={editable}
					onRowSave={editable ? handleRowSave : undefined}
					pageSize={pageSize}
					loading={loading}
				/>
			</FormProvider>
		</FieldKitProvider>
	);
}

/* ------------------------------------------------------------------ */
/*  Meta                                                               */
/* ------------------------------------------------------------------ */

const meta = {
	title: "Table/SpecDataTable",
	component: SpecDataTable,
	parameters: { layout: "padded" },
} satisfies Meta<typeof SpecDataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

export const Default: Story = {
	render: () => <TableWrapper data={sampleData} />,
};

export const Editable: Story = {
	render: () => <TableWrapper data={sampleData} editable />,
};

export const WithPagination: Story = {
	render: () => <TableWrapper data={sampleData} pageSize={3} />,
};

export const Loading: Story = {
	render: () => <TableWrapper data={[]} loading />,
};

export const Empty: Story = {
	render: () => <TableWrapper data={[]} />,
};
