import type { Meta, StoryObj } from "@storybook/react";
import type { FieldKitAdapters } from "../adapters";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const mockBlueprintAdapter: FieldKitAdapters["blueprint"] = {
	getSchema: async (_blueprintId: string) => {
		return [
			{
				field_type: "text",
				config: {
					name: "Product Name",
					api_accessor: "product_name",
					required: true,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "number",
				config: {
					name: "Price",
					api_accessor: "price",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "text",
				config: {
					name: "SKU",
					api_accessor: "sku",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "boolean",
				config: {
					name: "In Stock",
					api_accessor: "in_stock",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "text",
				config: {
					name: "Category",
					api_accessor: "category",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		] satisfies Field[];
	},
	getData: async (_blueprintId: string, _query) => {
		return {
			items: [],
			total: 0,
			page: 1,
			page_size: 25,
		};
	},
};

const defaultVirtualTableField: Field = {
	field_type: "virtual_table",
	config: {
		name: "Product Catalog",
		api_accessor: "product_catalog",
		required: false,
		instructions: "Embedded view of the product catalog",
	},
	settings: {
		blueprint: "products",
		max_records_per_page: 25,
	},
	children: null,
	system: false,
};

const emptyTableField: Field = {
	field_type: "virtual_table",
	config: {
		name: "Order Items",
		api_accessor: "order_items",
		required: false,
		instructions: "Items in this order",
	},
	settings: {
		blueprint: "products",
	},
	children: null,
	system: false,
};

const noAdapterField: Field = {
	field_type: "virtual_table",
	config: {
		name: "Product Catalog",
		api_accessor: "product_catalog",
		required: false,
		instructions: "This field has no adapter configured",
	},
	settings: {
		blueprint: "products",
	},
	children: null,
	system: false,
};

const slowBlueprintAdapter: FieldKitAdapters["blueprint"] = {
	getSchema: async (_blueprintId: string) => {
		await new Promise((resolve) => setTimeout(resolve, 60000));
		return [];
	},
	getData: async (_blueprintId: string, _query) => {
		return { items: [], total: 0, page: 1, page_size: 25 };
	},
};

const loadingField: Field = {
	field_type: "virtual_table",
	config: {
		name: "Slow Table",
		api_accessor: "slow_table",
		required: false,
		instructions: "This table's adapter never resolves, showing the loading state",
	},
	settings: {
		blueprint: "products",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Virtual Table",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultWithMockAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultVirtualTableField]}
			defaultValues={{
				product_catalog: [
					{ product_name: "Wireless Keyboard", price: 79.99, sku: "KB-001", in_stock: true, category: "Peripherals" },
					{ product_name: "USB-C Hub", price: 49.99, sku: "HB-012", in_stock: true, category: "Accessories" },
					{ product_name: "Ergonomic Mouse", price: 59.99, sku: "MS-003", in_stock: false, category: "Peripherals" },
					{ product_name: "Monitor Stand", price: 129.00, sku: "ST-007", in_stock: true, category: "Furniture" },
					{ product_name: "Webcam HD", price: 89.95, sku: "WC-021", in_stock: true, category: "Peripherals" },
				],
			}}
			adapters={{ blueprint: mockBlueprintAdapter }}
		/>
	),
};

export const EmptyTable: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[emptyTableField]}
			defaultValues={{ order_items: [] }}
			adapters={{ blueprint: mockBlueprintAdapter }}
		/>
	),
};

export const Loading: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[loadingField]}
			defaultValues={{ slow_table: [] }}
			adapters={{ blueprint: slowBlueprintAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[noAdapterField]}
			defaultValues={{ product_catalog: [] }}
		/>
	),
};
