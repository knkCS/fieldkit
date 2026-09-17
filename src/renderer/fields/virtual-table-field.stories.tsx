import type { Meta, StoryObj } from "@storybook/react";
import type { VirtualTableSettings } from "../../schema/field-types/virtual-table";
import type { Field } from "../../schema/types";
import type { FieldKitAdapters } from "../adapters";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

function rowField(
	fieldType: string,
	name: string,
	accessor: string,
	required = false,
): Field {
	return {
		field_type: fieldType,
		config: { name, api_accessor: accessor, required, instructions: "" },
		settings: null,
		children: null,
		system: false,
	};
}

/** A line-items table: what one row of an order holds. */
const ROW_SPEC: Field[] = [
	rowField("text", "Description", "description", true),
	rowField("number", "Quantity", "quantity"),
	rowField("number", "Unit price", "unit_price"),
	rowField("boolean", "Taxed", "taxed"),
];

function lineItems(
	settings: VirtualTableSettings,
	children: Field[] | null,
	instructions = "",
): Field<VirtualTableSettings> {
	return {
		field_type: "virtual_table",
		config: {
			name: "Line items",
			api_accessor: "line_items",
			required: false,
			instructions,
		},
		settings,
		children,
		system: false,
	};
}

const ROWS = [
	{ description: "Binding", quantity: 2, unit_price: 12.5, taxed: true },
	{ description: "Cover", quantity: 1, unit_price: 40, taxed: true },
	{ description: "Proof copy", quantity: 3, unit_price: 5, taxed: false },
	{ description: "Delivery", quantity: 1, unit_price: 9.9, taxed: false },
	{ description: "Handling", quantity: 1, unit_price: 2.5, taxed: false },
];

/** Stands in for a Consumer's Blueprint backend: the linked Row Spec, fetched. */
const mockBlueprintAdapter: FieldKitAdapters["blueprint"] = {
	getSchema: async (_blueprintId: string) => ROW_SPEC,
	getData: async (_blueprintId: string, _query) => ({
		items: [],
		total: 0,
		page: 1,
		page_size: 25,
	}),
};

const slowBlueprintAdapter: FieldKitAdapters["blueprint"] = {
	getSchema: async (_blueprintId: string) => {
		await new Promise((resolve) => setTimeout(resolve, 60000));
		return [];
	},
	getData: async (_blueprintId: string, _query) => ({
		items: [],
		total: 0,
		page: 1,
		page_size: 25,
	}),
};

const meta = {
	title: "Fields/Virtual Table",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const EmbeddedRowSpec: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				lineItems({}, ROW_SPEC, "Add, edit and delete rows of this order"),
			]}
			defaultValues={{ line_items: ROWS.slice(0, 3) }}
		/>
	),
};

export const LinkedRowSpec: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				lineItems(
					{ blueprint: "line_item_bp" },
					null,
					"The Row Spec comes from a Blueprint, through the adapter",
				),
			]}
			defaultValues={{ line_items: ROWS.slice(0, 2) }}
			adapters={{ blueprint: mockBlueprintAdapter }}
		/>
	),
};

export const Paged: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				lineItems(
					{ max_records_per_page: 2 },
					ROW_SPEC,
					"Two rows per page, paged over the stored array",
				),
			]}
			defaultValues={{ line_items: ROWS }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[lineItems({}, ROW_SPEC, "No add, no edit, no delete")]}
			defaultValues={{ line_items: ROWS.slice(0, 3) }}
			readOnly
		/>
	),
};

export const InvalidRow: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				lineItems(
					{},
					ROW_SPEC,
					"Submit to see row 2's missing description reported on its row",
				),
			]}
			defaultValues={{
				line_items: [
					{ description: "Binding", quantity: 2, unit_price: 12.5 },
					{ description: "", quantity: 1, unit_price: 40 },
				],
			}}
		/>
	),
};

export const Capped: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				lineItems(
					{ min_items: 1, max_items: 3 },
					ROW_SPEC,
					"Between one and three rows: Add row and delete come and go with the caps",
				),
			]}
			defaultValues={{ line_items: ROWS.slice(0, 3) }}
		/>
	),
};

export const EmptyTable: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[lineItems({}, ROW_SPEC, "Nothing stored yet")]}
			defaultValues={{ line_items: [] }}
		/>
	),
};

export const Loading: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				lineItems(
					{ blueprint: "line_item_bp" },
					null,
					"This table's adapter never resolves, showing the loading state",
				),
			]}
			defaultValues={{ line_items: [] }}
			adapters={{ blueprint: slowBlueprintAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				lineItems(
					{ blueprint: "line_item_bp" },
					null,
					"A linked Row Spec with no adapter configured",
				),
			]}
			defaultValues={{ line_items: [] }}
		/>
	),
};
