import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultTextField: Field = {
	field_type: "text",
	config: {
		name: "Title",
		api_accessor: "title",
		required: false,
		instructions: "Enter a title for this entry",
	},
	settings: {
		placeholder: "e.g. My First Post",
	},
	children: null,
	system: false,
};

const prependAppendField: Field = {
	field_type: "text",
	config: {
		name: "Website",
		api_accessor: "website",
		required: false,
		instructions: "Enter the domain name",
	},
	settings: {
		prepend: "https://",
		append: ".com",
		placeholder: "example",
	},
	children: null,
	system: false,
};

const validationField: Field = {
	field_type: "text",
	config: {
		name: "Username",
		api_accessor: "username",
		required: true,
		instructions: "3-20 characters, letters and numbers only",
	},
	validation: {
		min_length: 3,
		max_length: 20,
		pattern: "^[a-zA-Z0-9]+$",
		pattern_message: "Only letters and numbers are allowed",
	},
	settings: {
		placeholder: "johndoe",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "text",
	config: {
		name: "Title",
		api_accessor: "title",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Text",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultTextField]}
			defaultValues={{ title: "" }}
		/>
	),
};

export const WithPrependAppend: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[prependAppendField]}
			defaultValues={{ website: "" }}
		/>
	),
};

export const WithValidation: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[validationField]}
			defaultValues={{ username: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ title: "Read-only value" }}
			readOnly
		/>
	),
};
