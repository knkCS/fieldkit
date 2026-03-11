import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultGroupField: Field = {
	field_type: "group",
	config: {
		name: "Links",
		api_accessor: "links",
		required: false,
		instructions: "Add related links",
	},
	settings: {},
	children: [
		{
			field_type: "text",
			config: {
				name: "Label",
				api_accessor: "label",
				required: false,
				instructions: "",
			},
			settings: { placeholder: "Link text" },
			children: null,
			system: false,
		},
		{
			field_type: "url",
			config: {
				name: "URL",
				api_accessor: "url",
				required: false,
				instructions: "",
			},
			settings: { placeholder: "https://example.com" },
			children: null,
			system: false,
		},
	],
	system: false,
};

const withChildrenField: Field = {
	field_type: "group",
	config: {
		name: "Team Members",
		api_accessor: "team_members",
		required: false,
		instructions: "Add team members with their details",
	},
	settings: {},
	children: [
		{
			field_type: "text",
			config: {
				name: "Name",
				api_accessor: "name",
				required: true,
				instructions: "",
			},
			settings: { placeholder: "Full name" },
			children: null,
			system: false,
		},
		{
			field_type: "email",
			config: {
				name: "Email",
				api_accessor: "email",
				required: false,
				instructions: "",
			},
			settings: { placeholder: "name@company.com" },
			children: null,
			system: false,
		},
		{
			field_type: "select",
			config: {
				name: "Role",
				api_accessor: "role",
				required: false,
				instructions: "",
			},
			settings: {
				options: {
					developer: "Developer",
					designer: "Designer",
					manager: "Manager",
				},
			},
			children: null,
			system: false,
		},
	],
	system: false,
};

const withMinMaxField: Field = {
	field_type: "group",
	config: {
		name: "Features",
		api_accessor: "features",
		required: false,
		instructions: "Between 1 and 5 features",
	},
	settings: {
		min_items: 1,
		max_items: 5,
	},
	children: [
		{
			field_type: "text",
			config: {
				name: "Feature",
				api_accessor: "feature",
				required: false,
				instructions: "",
			},
			settings: { placeholder: "Describe the feature" },
			children: null,
			system: false,
		},
	],
	system: false,
};

const readOnlyField: Field = {
	field_type: "group",
	config: {
		name: "Links",
		api_accessor: "links",
		required: false,
		instructions: "",
	},
	settings: {},
	children: [
		{
			field_type: "text",
			config: {
				name: "Label",
				api_accessor: "label",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		},
		{
			field_type: "url",
			config: {
				name: "URL",
				api_accessor: "url",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		},
	],
	system: false,
};

const meta = {
	title: "Fields/Group",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultGroupField]}
			defaultValues={{ links: [] }}
		/>
	),
};

export const WithChildren: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withChildrenField]}
			defaultValues={{ team_members: [] }}
		/>
	),
};

export const WithMinMax: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withMinMaxField]}
			defaultValues={{ features: [{ feature: "" }] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				links: [
					{ label: "Homepage", url: "https://example.com" },
					{ label: "Docs", url: "https://docs.example.com" },
				],
			}}
			readOnly
		/>
	),
};
