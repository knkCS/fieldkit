import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultTextareaField: Field = {
	field_type: "textarea",
	config: {
		name: "Description",
		api_accessor: "description",
		required: false,
		instructions: "Enter a description",
	},
	settings: {
		placeholder: "Write something...",
	},
	children: null,
	system: false,
};

const customRowsField: Field = {
	field_type: "textarea",
	config: {
		name: "Long Description",
		api_accessor: "long_description",
		required: false,
		instructions: "This textarea has 8 rows",
	},
	settings: {
		placeholder: "Write a detailed description...",
		rows: 8,
	},
	children: null,
	system: false,
};

const maxLengthField: Field = {
	field_type: "textarea",
	config: {
		name: "Summary",
		api_accessor: "summary",
		required: true,
		instructions: "Max 200 characters",
	},
	validation: {
		max_length: 200,
	},
	settings: {
		placeholder: "Brief summary...",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "textarea",
	config: {
		name: "Description",
		api_accessor: "description",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Textarea",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultTextareaField]}
			defaultValues={{ description: "" }}
		/>
	),
};

export const CustomRows: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[customRowsField]}
			defaultValues={{ long_description: "" }}
		/>
	),
};

export const WithMaxLength: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[maxLengthField]}
			defaultValues={{ summary: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ description: "This is a read-only textarea value.\n\nIt spans multiple lines." }}
			readOnly
		/>
	),
};
