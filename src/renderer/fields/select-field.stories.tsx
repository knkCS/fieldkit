import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultSingleField: Field = {
	field_type: "select",
	config: {
		name: "Category",
		api_accessor: "category",
		required: false,
		instructions: "Select a category",
	},
	settings: {
		options: [
			{ key: "news", label: "News" },
			{ key: "blog", label: "Blog" },
			{ key: "tutorial", label: "Tutorial" },
		],
	},
	children: null,
	system: false,
};

const multiSelectField: Field = {
	field_type: "select",
	config: {
		name: "Tags",
		api_accessor: "tags",
		required: false,
		instructions: "Select one or more tags",
	},
	settings: {
		options: [
			{ key: "javascript", label: "JavaScript" },
			{ key: "typescript", label: "TypeScript" },
			{ key: "react", label: "React" },
			{ key: "vue", label: "Vue" },
			{ key: "angular", label: "Angular" },
		],
		multiple: true,
	},
	children: null,
	system: false,
};

const manyOptionsField: Field = {
	field_type: "select",
	config: {
		name: "Country",
		api_accessor: "country",
		required: false,
		instructions: "Select your country",
	},
	settings: {
		options: [
			{ key: "de", label: "Germany" },
			{ key: "at", label: "Austria" },
			{ key: "ch", label: "Switzerland" },
			{ key: "us", label: "United States" },
			{ key: "gb", label: "United Kingdom" },
			{ key: "fr", label: "France" },
			{ key: "es", label: "Spain" },
			{ key: "it", label: "Italy" },
			{ key: "nl", label: "Netherlands" },
			{ key: "be", label: "Belgium" },
			{ key: "se", label: "Sweden" },
			{ key: "no", label: "Norway" },
			{ key: "dk", label: "Denmark" },
			{ key: "fi", label: "Finland" },
			{ key: "pl", label: "Poland" },
		],
	},
	children: null,
	system: false,
};

const requiredField: Field = {
	field_type: "select",
	config: {
		name: "Status",
		api_accessor: "status",
		required: true,
		instructions: "A status is required",
	},
	settings: {
		options: [
			{ key: "draft", label: "Draft" },
			{ key: "review", label: "In Review" },
			{ key: "published", label: "Published" },
		],
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "select",
	config: {
		name: "Category",
		api_accessor: "category",
		required: false,
		instructions: "",
	},
	settings: {
		options: [
			{ key: "news", label: "News" },
			{ key: "blog", label: "Blog" },
			{ key: "tutorial", label: "Tutorial" },
		],
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Select",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultSingle: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultSingleField]}
			defaultValues={{ category: "" }}
		/>
	),
};

export const MultiSelect: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[multiSelectField]}
			defaultValues={{ tags: [] }}
		/>
	),
};

export const ManyOptions: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[manyOptionsField]}
			defaultValues={{ country: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredField]}
			defaultValues={{ status: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ category: "blog" }}
			readOnly
		/>
	),
};
