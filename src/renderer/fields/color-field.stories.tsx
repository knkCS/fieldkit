import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultColorField: Field = {
	field_type: "color",
	config: {
		name: "Brand Color",
		api_accessor: "brand_color",
		required: false,
		instructions: "Pick a brand color",
	},
	settings: {
		default_color: "#3B82F6",
	},
	children: null,
	system: false,
};

const requiredColorField: Field = {
	field_type: "color",
	config: {
		name: "Primary Color",
		api_accessor: "primary_color",
		required: true,
		instructions: "A primary color is required",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "color",
	config: {
		name: "Brand Color",
		api_accessor: "brand_color",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Color",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultColorField]}
			defaultValues={{ brand_color: "#3B82F6" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredColorField]}
			defaultValues={{ primary_color: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ brand_color: "#10B981" }}
			readOnly
		/>
	),
};
