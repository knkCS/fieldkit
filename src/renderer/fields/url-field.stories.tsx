import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultUrlField: Field = {
	field_type: "url",
	config: {
		name: "Website",
		api_accessor: "website",
		required: false,
		instructions: "Enter a full URL including protocol",
	},
	settings: {
		placeholder: "https://example.com",
	},
	children: null,
	system: false,
};

const requiredUrlField: Field = {
	field_type: "url",
	config: {
		name: "Homepage",
		api_accessor: "homepage",
		required: true,
		instructions: "A valid URL is required",
	},
	settings: {
		placeholder: "https://example.com",
	},
	children: null,
	system: false,
};

const optionalUrlField: Field = {
	field_type: "url",
	config: {
		name: "Portfolio",
		api_accessor: "portfolio",
		required: false,
		instructions: "Optional link to your portfolio",
	},
	settings: {
		placeholder: "https://portfolio.example.com",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "url",
	config: {
		name: "Website",
		api_accessor: "website",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const cellNoteField: Field = {
	field_type: "url",
	config: {
		name: "Documentation",
		api_accessor: "documentation",
		required: false,
		instructions: "Note: z.string().url() requires a protocol prefix (e.g. https://)",
	},
	settings: {
		placeholder: "https://docs.example.com/very/long/path/to/resource",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/URL",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultUrlField]}
			defaultValues={{ website: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredUrlField]}
			defaultValues={{ homepage: "" }}
		/>
	),
};

export const Optional: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[optionalUrlField]}
			defaultValues={{ portfolio: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ website: "https://example.com" }}
			readOnly
		/>
	),
};

export const CellNote: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[cellNoteField]}
			defaultValues={{ documentation: "" }}
		/>
	),
};
