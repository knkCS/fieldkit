import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultNumberField: Field = {
	field_type: "number",
	config: {
		name: "Quantity",
		api_accessor: "quantity",
		required: false,
		instructions: "Enter a quantity",
	},
	settings: null,
	children: null,
	system: false,
};

const minMaxField: Field = {
	field_type: "number",
	config: {
		name: "Age",
		api_accessor: "age",
		required: true,
		instructions: "Must be between 0 and 150",
	},
	settings: {
		min: 0,
		max: 150,
	},
	children: null,
	system: false,
};

const stepField: Field = {
	field_type: "number",
	config: {
		name: "Price",
		api_accessor: "price",
		required: false,
		instructions: "Enter price in EUR",
	},
	settings: {
		min: 0,
		step: 0.01,
		prepend: "EUR",
	},
	children: null,
	system: false,
};

const prependAppendField: Field = {
	field_type: "number",
	config: {
		name: "Weight",
		api_accessor: "weight",
		required: false,
		instructions: "Enter the product weight",
	},
	settings: {
		min: 0,
		prepend: "~",
		append: "kg",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "number",
	config: {
		name: "Quantity",
		api_accessor: "quantity",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Number",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultNumberField]}
			defaultValues={{ quantity: 0 }}
		/>
	),
};

export const WithMinMax: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[minMaxField]}
			defaultValues={{ age: 25 }}
		/>
	),
};

export const WithStep: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[stepField]}
			defaultValues={{ price: 9.99 }}
		/>
	),
};

export const WithPrependAppend: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[prependAppendField]}
			defaultValues={{ weight: 1.5 }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ quantity: 42 }}
			readOnly
		/>
	),
};
