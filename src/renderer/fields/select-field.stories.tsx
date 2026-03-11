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
		options: {
			news: "News",
			blog: "Blog",
			tutorial: "Tutorial",
		},
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
		options: {
			javascript: "JavaScript",
			typescript: "TypeScript",
			react: "React",
			vue: "Vue",
			angular: "Angular",
		},
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
		options: {
			de: "Germany",
			at: "Austria",
			ch: "Switzerland",
			us: "United States",
			gb: "United Kingdom",
			fr: "France",
			es: "Spain",
			it: "Italy",
			nl: "Netherlands",
			be: "Belgium",
			se: "Sweden",
			no: "Norway",
			dk: "Denmark",
			fi: "Finland",
			pl: "Poland",
		},
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
		options: {
			draft: "Draft",
			review: "In Review",
			published: "Published",
		},
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
		options: {
			news: "News",
			blog: "Blog",
			tutorial: "Tutorial",
		},
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
