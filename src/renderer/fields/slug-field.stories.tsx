import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultSlugField: Field = {
	field_type: "slug",
	config: {
		name: "Slug",
		api_accessor: "slug",
		required: false,
		instructions: "URL-friendly identifier",
	},
	settings: {},
	children: null,
	system: false,
};

const sourceTextField: Field = {
	field_type: "text",
	config: {
		name: "Title",
		api_accessor: "title",
		required: false,
		instructions: "Type here to auto-generate the slug below",
	},
	settings: {
		placeholder: "e.g. My Blog Post",
	},
	children: null,
	system: false,
};

const slugWithSourceField: Field = {
	field_type: "slug",
	config: {
		name: "Slug",
		api_accessor: "slug",
		required: false,
		instructions: "Auto-generated from the Title field above",
	},
	settings: {
		source_field: "title",
	},
	children: null,
	system: false,
};

const requiredSlugField: Field = {
	field_type: "slug",
	config: {
		name: "Page Slug",
		api_accessor: "page_slug",
		required: true,
		instructions: "Required — submit empty to see the validation error",
	},
	settings: {},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "slug",
	config: {
		name: "Slug",
		api_accessor: "slug",
		required: false,
		instructions: "",
	},
	settings: {},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Slug",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultSlugField]}
			defaultValues={{ slug: "" }}
		/>
	),
};

export const WithSourceField: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[sourceTextField, slugWithSourceField]}
			defaultValues={{ title: "", slug: "" }}
		/>
	),
};

export const WithValidation: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredSlugField]}
			defaultValues={{ page_slug: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ slug: "my-existing-slug" }}
			readOnly
		/>
	),
};
